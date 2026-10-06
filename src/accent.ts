/**
 * The app's highlight (brand) colour. A single colour becomes Fluent's 16-step brand ramp, worked out in
 * terms of WCAG luminance so that, whatever colour the system accent is, white text on buttons and brand
 * colour text on the dark surfaces stay readable. Kept free of Fluent and the DOM so `node --test` can run it.
 */
export type Rgb = { r: number; g: number; b: number };

/** XpieDB's own highlight colour (used unless the owner chooses the system accent). */
export const DEFAULT_ACCENT = "#f7821b";

// Surfaces of Fluent's dark theme that brand colours sit on: neutral background 1, 2 and 3.
export const SURFACES = ["#292929", "#1f1f1f", "#141414"] as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const hex2 = (n: number) =>
  Math.round(clamp01(n / 255) * 255)
    .toString(16)
    .padStart(2, "0");
export const toHex = ({ r, g, b }: Rgb) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Reads `#rgb`, `#rrggbb`, `rgb(r, g, b)` / `rgba(...)` and `color(srgb r g b)`; null for anything else. */
export function parseColor(value: string | null | undefined): Rgb | null {
  const text = (value ?? "").trim().toLowerCase();
  let match = /^#([0-9a-f]{3})$/.exec(text);
  if (match) {
    const [r, g, b] = [...match[1]].map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  match = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(text);
  if (match) {
    const n = parseInt(match[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (match) return rgbOf(match.slice(1, 4).map(Number), 255);
  match = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text);
  if (match) return rgbOf(match.slice(1, 4).map(Number), 1);
  return null;
}
function rgbOf(parts: number[], scale: number): Rgb | null {
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const [r, g, b] = parts.map((n) => Math.round(clamp01(n / scale) * 255));
  return { r, g, b };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Rgb) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Hsl = { h: number; s: number; l: number };
function toHsl({ r, g, b }: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
function fromHsl({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** The colour with this hue and saturation whose luminance is `target` (luminance rises with lightness). */
function withLuminance(h: number, s: number, target: number): Rgb {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(fromHsl({ h, s, l: mid })) < target) lo = mid;
    else hi = mid;
  }
  return fromHsl({ h, s, l: (lo + hi) / 2 });
}

export const SHADES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160] as const;
export type Ramp = Record<(typeof SHADES)[number], string>;

/**
 * Fluent's brand ramp for one colour. Anchors (in luminance): shade 70/80 are the button backgrounds
 * (white text on them needs 4.5:1, and they must stand out from the dark surfaces), shade 100/110 are brand text
 * and links on those surfaces (4.5:1); the rest are spread between. Hue and saturation come from the colour.
 */
export function brandRamp(color: string): Ramp {
  const base = parseColor(color) ?? parseColor(DEFAULT_ACCENT)!;
  const { h, s } = toHsl(base);
  const lumBase = luminance(base);
  const lum80 = Math.min(0.18, Math.max(0.11, lumBase));
  const lum70 = Math.max(0.095, lum80 * 0.82);
  const lum100 = Math.min(0.65, Math.max(0.32, lumBase));
  const lum110 = Math.min(0.85, lum100 * 1.15 + 0.02);
  // Luminance of each shade, interpolated between the anchors.
  const anchors: Array<[number, number]> = [
    [10, 0.004],
    [40, lum70 * 0.45],
    [70, lum70],
    [80, lum80],
    [100, lum100],
    [110, lum110],
    [160, 0.9],
  ];
  const lumOf = (shade: number) => {
    for (let i = 1; i < anchors.length; i++) {
      const [s1, l1] = anchors[i];
      const [s0, l0] = anchors[i - 1];
      if (shade <= s1) return l0 + ((l1 - l0) * (shade - s0)) / (s1 - s0);
    }
    return anchors[anchors.length - 1][1];
  };
  const ramp = {} as Ramp;
  for (const shade of SHADES) ramp[shade] = toHex(withLuminance(h, s, lumOf(shade)));
  return ramp;
}
