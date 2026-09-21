//! Page layout and PDF output. Layout is computed first as plain drawing
//! operations per page, so pagination can be tested without a PDF and so every
//! page knows the final page count for its footer.
use super::{Column, Paper, Report, Row};
use crate::catalog::Result;
use krilla::{
    Document,
    color::rgb,
    destination::XyzDestination,
    geom::{PathBuilder, Point},
    metadata::Metadata,
    num::NormalizedF32,
    outline::{Outline, OutlineNode},
    page::PageSettings,
    paint::Fill,
    text::{Font, TextDirection},
};

const REGULAR: &[u8] = include_bytes!("../../assets/fonts/DejaVuSans.ttf");
const BOLD: &[u8] = include_bytes!("../../assets/fonts/DejaVuSans-Bold.ttf");

const MARGIN_X: f32 = 42.0;
/// Rules and row shading extend this far past the text margin.
const BLEED: f32 = 4.0;
const MARGIN_TOP: f32 = 46.0;
const MARGIN_BOTTOM: f32 = 50.0;
const FONT: f32 = 9.5;
const LINE: f32 = 12.5;
const ROW_PAD: f32 = 3.0;
const COLUMN_GAP: f32 = 8.0;
const TITLE_SIZE: f32 = 20.0;
const HEADING_SIZE: f32 = 12.0;
const HEADING_HEIGHT: f32 = 20.0;
const HEADING_GAP: f32 = 12.0;
const FOOTER_SIZE: f32 = 8.0;

const INK: u8 = 0;
const MUTED: u8 = 105;
const SHADE: u8 = 244;
const RULE: u8 = 190;

/// How a run of text is drawn.
#[derive(Clone, Copy)]
struct Style {
    size: f32,
    bold: bool,
    gray: u8,
}
const BODY: Style = Style {
    size: FONT,
    bold: false,
    gray: INK,
};
const NOTE: Style = Style {
    size: FONT,
    bold: false,
    gray: MUTED,
};
const TITLE: Style = Style {
    size: TITLE_SIZE,
    bold: true,
    gray: INK,
};
const COLUMN_HEAD: Style = Style {
    size: FONT - 0.5,
    bold: true,
    gray: MUTED,
};
const HEADING: Style = Style {
    size: HEADING_SIZE,
    bold: true,
    gray: INK,
};

#[derive(Debug)]
pub enum Op {
    Text {
        x: f32,
        y: f32,
        size: f32,
        bold: bool,
        gray: u8,
        text: String,
    },
    Rect {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        gray: u8,
    },
}

pub struct Layout {
    pub pages: Vec<Vec<Op>>,
    /// (heading, page index, y) for each section heading, for PDF bookmarks.
    pub outline: Vec<(String, usize, f32)>,
    pub unsupported: usize,
    pub width: f32,
    pub height: f32,
}

pub struct Rendered {
    pub bytes: Vec<u8>,
    pub pages: usize,
    pub unsupported: usize,
}

struct Face {
    face: ttf_parser::Face<'static>,
    scale: f32,
}
impl Face {
    fn new(data: &'static [u8]) -> Result<Self> {
        let face = ttf_parser::Face::parse(data, 0).map_err(|e| e.to_string())?;
        let scale = 1.0 / f32::from(face.units_per_em());
        Ok(Self { face, scale })
    }
    fn has(&self, c: char) -> bool {
        self.face.glyph_index(c).is_some()
    }
    fn width(&self, text: &str, size: f32) -> f32 {
        let units: u32 = text
            .chars()
            .map(|c| {
                self.face
                    .glyph_index(c)
                    .and_then(|g| self.face.glyph_hor_advance(g))
                    .map_or(0, u32::from)
            })
            .sum();
        units as f32 * self.scale * size
    }
}

struct Fonts {
    regular: Face,
    bold: Face,
}
impl Fonts {
    fn face(&self, bold: bool) -> &Face {
        if bold { &self.bold } else { &self.regular }
    }
}

/// Column widths: fixed columns take what their content needs, flexible ones
/// share the remainder by weight.
enum Width {
    Fixed(f32),
    Flex(f32),
}
fn spec(column: Option<Column>) -> (&'static str, Width) {
    match column {
        None => ("Title", Width::Flex(4.0)),
        Some(Column::Platform) => ("Platform", Width::Flex(2.0)),
        Some(Column::Year) => ("Year", Width::Fixed(30.0)),
        Some(Column::Genre) => ("Genre", Width::Flex(2.4)),
        Some(Column::Status) => ("Status", Width::Fixed(64.0)),
        Some(Column::Rating) => ("Rating", Width::Fixed(52.0)),
        Some(Column::Account) => ("Account", Width::Flex(1.8)),
        Some(Column::MediaType) => ("Media", Width::Fixed(52.0)),
    }
}

struct Col {
    label: &'static str,
    x: f32,
    width: f32,
}

fn page_size(paper: Paper, landscape: bool) -> (f32, f32) {
    let (w, h) = match paper {
        Paper::Letter => (612.0, 792.0),
        Paper::A4 => (595.276, 841.89),
    };
    if landscape { (h, w) } else { (w, h) }
}

struct Builder<'a> {
    fonts: &'a Fonts,
    w: f32,
    h: f32,
    cols: Vec<Col>,
    pages: Vec<Vec<Op>>,
    y: f32,
    content_top: f32,
    outline: Vec<(String, usize, f32)>,
    unsupported: usize,
    title: &'a str,
    subtitle: &'a str,
}

impl Builder<'_> {
    fn bottom(&self) -> f32 {
        self.h - MARGIN_BOTTOM
    }
    fn page(&mut self) -> &mut Vec<Op> {
        self.pages.last_mut().expect("a page is open")
    }
    /// Replaces control characters and glyphs the font lacks, counting the latter.
    fn clean(&mut self, text: &str, bold: bool) -> String {
        let mut out = String::with_capacity(text.len());
        for c in text.chars() {
            if c.is_control() || c.is_whitespace() {
                out.push(' ');
            } else if self.fonts.face(bold).has(c) {
                out.push(c);
            } else {
                out.push('?');
                self.unsupported += 1;
            }
        }
        out
    }
    fn wrap(&self, text: &str, size: f32, bold: bool, max: f32) -> Vec<String> {
        let face = self.fonts.face(bold);
        let mut lines = Vec::new();
        let mut current = String::new();
        for word in text.split_whitespace() {
            let candidate = if current.is_empty() {
                word.to_string()
            } else {
                format!("{current} {word}")
            };
            if face.width(&candidate, size) <= max {
                current = candidate;
                continue;
            }
            if !current.is_empty() {
                lines.push(std::mem::take(&mut current));
            }
            if face.width(word, size) <= max {
                current = word.to_string();
                continue;
            }
            // A single word wider than the column is broken by characters.
            let mut piece = String::new();
            for c in word.chars() {
                let mut longer = piece.clone();
                longer.push(c);
                if !piece.is_empty() && face.width(&longer, size) > max {
                    lines.push(std::mem::replace(&mut piece, c.to_string()));
                } else {
                    piece = longer;
                }
            }
            current = piece;
        }
        if !current.is_empty() || lines.is_empty() {
            lines.push(current);
        }
        lines
    }
    fn text(&mut self, x: f32, top: f32, line: f32, style: Style, text: String) {
        let Style { size, bold, gray } = style;
        // Baseline inside a line box: centred using DejaVu's ascent and descent.
        let y = top + (line - size * 1.164) / 2.0 + size * 0.928;
        self.page().push(Op::Text {
            x,
            y,
            size,
            bold,
            gray,
            text,
        });
    }
    fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, gray: u8) {
        self.page().push(Op::Rect { x, y, w, h, gray });
    }
    fn rule(&mut self, y: f32, gray: u8) {
        self.rect(
            MARGIN_X - BLEED,
            y,
            self.w - 2.0 * MARGIN_X + 2.0 * BLEED,
            0.6,
            gray,
        );
    }

    fn new_page(&mut self) {
        self.pages.push(Vec::new());
        self.y = MARGIN_TOP;
        if self.pages.len() == 1 {
            let title = self.title.to_string();
            self.text(MARGIN_X, self.y, 26.0, TITLE, title);
            self.y += 26.0;
            let subtitle = self.subtitle.to_string();
            self.text(MARGIN_X, self.y, LINE, NOTE, subtitle);
            self.y += LINE + 12.0;
        }
        self.header_row();
        self.content_top = self.y;
    }
    fn ensure(&mut self, needed: f32) {
        if self.y + needed > self.bottom() {
            self.new_page();
        }
    }
    fn header_row(&mut self) {
        let labels: Vec<_> = self.cols.iter().map(|c| (c.x, c.label)).collect();
        for (x, label) in labels {
            self.text(x, self.y + ROW_PAD, LINE, COLUMN_HEAD, label.into());
        }
        self.y += LINE + 2.0 * ROW_PAD;
        self.rule(self.y, INK);
        self.y += 1.0;
    }

    /// Wraps each cell and returns the lines and the resulting row height.
    fn measure(&mut self, row: &Row) -> (Vec<Vec<String>>, f32) {
        let mut cells = Vec::new();
        for (i, text) in row.cells.iter().enumerate() {
            let width = self.cols[i].width;
            let cleaned = self.clean(text, false);
            cells.push(self.wrap(&cleaned, FONT, false, width));
        }
        let lines = cells.iter().map(Vec::len).max().unwrap_or(1);
        (cells, lines as f32 * LINE + 2.0 * ROW_PAD)
    }
    fn place_row(&mut self, cells: &[Vec<String>], height: f32, shaded: bool) {
        self.ensure(height);
        if shaded {
            self.rect(
                MARGIN_X - BLEED,
                self.y,
                self.w - 2.0 * MARGIN_X + 2.0 * BLEED,
                height,
                SHADE,
            );
        }
        for (i, lines) in cells.iter().enumerate() {
            for (n, line) in lines.iter().enumerate() {
                let x = self.cols[i].x;
                let top = self.y + ROW_PAD + n as f32 * LINE;
                self.text(x, top, LINE, BODY, line.clone());
            }
        }
        self.y += height;
    }
    fn at_content_top(&self) -> bool {
        (self.y - self.content_top).abs() < 0.01
    }
}

/// Width of `text` in points, for tests that check nothing overflows.
#[cfg(test)]
pub fn text_width(text: &str, size: f32, bold: bool) -> f32 {
    Face::new(if bold { BOLD } else { REGULAR })
        .unwrap()
        .width(text, size)
}

pub fn layout(report: &Report, paper: Paper, landscape: bool) -> Result<Layout> {
    let fonts = Fonts {
        regular: Face::new(REGULAR)?,
        bold: Face::new(BOLD)?,
    };
    let (w, h) = page_size(paper, landscape);

    let mut specs = Vec::new();
    if report.numbered {
        specs.push(("#", Width::Fixed(26.0)));
    }
    specs.extend(
        std::iter::once(None)
            .chain(report.columns.iter().copied().map(Some))
            .map(spec),
    );
    let gaps = COLUMN_GAP * (specs.len() - 1) as f32;
    let fixed: f32 = specs
        .iter()
        .map(|(_, w)| if let Width::Fixed(v) = w { *v } else { 0.0 })
        .sum();
    let flex: f32 = specs
        .iter()
        .map(|(_, w)| if let Width::Flex(v) = w { *v } else { 0.0 })
        .sum();
    let spare = (w - 2.0 * MARGIN_X - gaps - fixed).max(0.0);
    let mut x = MARGIN_X;
    let mut cols = Vec::new();
    for (label, width) in &specs {
        let width = match width {
            Width::Fixed(v) => *v,
            Width::Flex(v) => spare * v / flex,
        };
        cols.push(Col { label, x, width });
        x += width + COLUMN_GAP;
    }

    let mut b = Builder {
        fonts: &fonts,
        w,
        h,
        cols,
        pages: Vec::new(),
        y: 0.0,
        content_top: 0.0,
        outline: Vec::new(),
        unsupported: 0,
        title: &report.title,
        subtitle: &report.subtitle,
    };
    b.new_page();

    if report.games == 0 {
        let x = MARGIN_X;
        let y = b.y + 10.0;
        b.text(x, y, LINE, NOTE, report.empty_message.clone());
    }
    for section in &report.sections {
        if section.rows.is_empty() {
            continue;
        }
        let measured: Vec<_> = section.rows.iter().map(|r| b.measure(r)).collect();
        if let Some(heading) = &section.heading {
            // Keep a heading with at least its first two rows.
            let lead: f32 = measured.iter().take(2).map(|(_, h)| h).sum();
            let before = if b.at_content_top() { 0.0 } else { HEADING_GAP };
            if b.y + before + HEADING_HEIGHT + lead > b.bottom() {
                b.new_page();
            }
            if !b.at_content_top() {
                b.y += HEADING_GAP;
            }
            let name = b.clean(heading, true);
            let count = section.rows.len();
            let suffix = format!("{count} {}", if count == 1 { "game" } else { "games" });
            let name_width = b.fonts.bold.width(&name, HEADING_SIZE);
            let top = b.y;
            b.text(MARGIN_X, top, HEADING_HEIGHT - 4.0, HEADING, name.clone());
            b.text(
                MARGIN_X + name_width + 8.0,
                top,
                HEADING_HEIGHT - 4.0,
                NOTE,
                suffix,
            );
            b.outline.push((name, b.pages.len() - 1, top));
            b.y += HEADING_HEIGHT - 4.0;
            b.rule(b.y, RULE);
            b.y += 3.0;
        }
        for (i, (cells, height)) in measured.iter().enumerate() {
            b.place_row(cells, *height, i % 2 == 1);
        }
    }

    // Footers need the final page count.
    let total = b.pages.len();
    for i in 0..total {
        let label = format!("Page {} of {total}", i + 1);
        let title = format!("XpieDB  ·  {}", report.title);
        let top = h - MARGIN_BOTTOM + 14.0;
        let label_x = w - MARGIN_X - fonts.regular.width(&label, FOOTER_SIZE);
        b.pages[i].push(Op::Rect {
            x: MARGIN_X - BLEED,
            y: top - 6.0,
            w: w - 2.0 * MARGIN_X + 2.0 * BLEED,
            h: 0.6,
            gray: RULE,
        });
        let base = top + FOOTER_SIZE * 0.928;
        b.pages[i].push(Op::Text {
            x: MARGIN_X,
            y: base,
            size: FOOTER_SIZE,
            bold: false,
            gray: MUTED,
            text: title,
        });
        b.pages[i].push(Op::Text {
            x: label_x,
            y: base,
            size: FOOTER_SIZE,
            bold: false,
            gray: MUTED,
            text: label,
        });
    }
    Ok(Layout {
        pages: b.pages,
        outline: b.outline,
        unsupported: b.unsupported,
        width: w,
        height: h,
    })
}

pub fn render(report: &Report, paper: Paper, landscape: bool) -> Result<Rendered> {
    let laid = layout(report, paper, landscape)?;
    let load = |data: &'static [u8]| {
        Font::new(data.to_vec().into(), 0).ok_or("The report font could not be loaded.")
    };
    let (regular, bold) = (load(REGULAR)?, load(BOLD)?);
    let fill = |gray: u8| Fill {
        paint: rgb::Color::new(gray, gray, gray).into(),
        opacity: NormalizedF32::ONE,
        rule: Default::default(),
    };
    let mut document = Document::new();
    for ops in &laid.pages {
        let settings =
            PageSettings::from_wh(laid.width, laid.height).ok_or("Invalid page size.")?;
        let mut page = document.start_page_with(settings);
        let mut surface = page.surface();
        for op in ops {
            match op {
                Op::Text {
                    x,
                    y,
                    size,
                    bold: is_bold,
                    gray,
                    text,
                } => {
                    surface.set_fill(Some(fill(*gray)));
                    let font = if *is_bold {
                        bold.clone()
                    } else {
                        regular.clone()
                    };
                    surface.draw_text(
                        Point::from_xy(*x, *y),
                        font,
                        *size,
                        text,
                        false,
                        TextDirection::Auto,
                    );
                }
                Op::Rect { x, y, w, h, gray } => {
                    let mut path = PathBuilder::new();
                    path.move_to(*x, *y);
                    path.line_to(x + w, *y);
                    path.line_to(x + w, y + h);
                    path.line_to(*x, y + h);
                    path.close();
                    if let Some(path) = path.finish() {
                        surface.set_fill(Some(fill(*gray)));
                        surface.draw_path(&path);
                    }
                }
            }
        }
        surface.finish();
        page.finish();
    }
    if !laid.outline.is_empty() {
        let mut outline = Outline::new();
        for (name, page, y) in &laid.outline {
            outline.push_child(OutlineNode::new(
                name.clone(),
                XyzDestination::new(*page, Point::from_xy(0.0, *y)),
            ));
        }
        document.set_outline(outline);
    }
    document.set_metadata(
        Metadata::new()
            .title(format!("XpieDB - {}", report.title))
            .creator("XpieDB".to_string()),
    );
    let bytes = document
        .finish()
        .map_err(|e| format!("The PDF could not be created: {e:?}"))?;
    Ok(Rendered {
        bytes,
        pages: laid.pages.len(),
        unsupported: laid.unsupported,
    })
}
