import type { Page } from "@playwright/test";

/**
 * A small real PDF: one line of text per page, and (optionally) a table of contents pointing at pages.
 * Built by hand so the reader tests exercise PDF.js on genuine bytes.
 */
export function buildPdf(
  pages: string[],
  outline: Array<{ title: string; page: number }> = [],
  /** Unused bytes to add, to make a large file. */
  padding = 0,
): Buffer {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add("");
  const pagesRoot = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  for (const text of pages) {
    const stream = `BT /F1 20 Tf 30 150 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 400 300] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      ),
    );
  }
  objects[pagesRoot - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  let outlines = "";
  if (outline.length) {
    const root = add("");
    const items = outline.map(() => add(""));
    outline.forEach((entry, i) => {
      objects[items[i] - 1] =
        `<< /Title (${entry.title}) /Parent ${root} 0 R /Dest [${pageIds[entry.page - 1]} 0 R /Fit]` +
        (i > 0 ? ` /Prev ${items[i - 1]} 0 R` : "") +
        (i < items.length - 1 ? ` /Next ${items[i + 1]} 0 R` : "") +
        " >>";
    });
    objects[root - 1] = `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items[items.length - 1]} 0 R /Count ${items.length} >>`;
    outlines = ` /Outlines ${root} 0 R`;
  }
  if (padding) add(`<< /Length ${padding} >>\nstream\n${"x".repeat(padding)}\nendstream`);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R${outlines} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** An eight-page guide: "dragon" appears on pages 3 and 5, "zebra" only on page 8. */
export const guideText = [
  "Page 1 Introduction",
  "Page 2 Controls and menus",
  "Page 3 Weapons: the dragon sword",
  "Page 4 Weapons: bows",
  "Page 5 Bosses: the dragon king",
  "Page 6 Bosses: the lich",
  "Page 7 Secrets",
  "Page 8 Index zebra",
];
export const guidePdf = () =>
  buildPdf(guideText, [
    { title: "Introduction", page: 1 },
    { title: "Weapons", page: 3 },
    { title: "Bosses", page: 5 },
  ]);

/** Serves PDFs for the reader's guidefile URLs, honouring byte ranges like the real app does. */
export async function servePdfs(
  page: Page,
  files: Record<number, Buffer>,
  /** Like the app: at most `chunk` bytes per request, and no Range on a file over `chunk` gets just its start. */
  chunk = 4 * 1024 * 1024,
) {
  const requests: Array<{ id: number; range: string | null; bytes: number }> = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "Content-Range, Content-Length, Accept-Ranges",
    "access-control-allow-headers": "Range",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
  };
  await page.route("**://guidefile.localhost/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const id = Number(new URL(request.url()).pathname.slice(1));
    const bytes = files[id];
    if (!bytes) return route.fulfill({ status: 404, headers: cors, body: "Not found" });
    const range = request.headers()["range"] ?? null;
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    if (match || bytes.length > chunk) {
      const start = match ? Number(match[1]) : 0;
      const end = Math.min(
        match && match[2] ? Number(match[2]) : bytes.length - 1,
        start + chunk - 1,
        bytes.length - 1,
      );
      requests.push({ id, range, bytes: end - start + 1 });
      return route.fulfill({
        status: 206,
        body: bytes.subarray(start, end + 1),
        headers: {
          ...cors,
          "content-type": "application/pdf",
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${bytes.length}`,
        },
      });
    }
    requests.push({ id, range, bytes: bytes.length });
    return route.fulfill({
      status: 200,
      body: bytes,
      headers: { ...cors, "content-type": "application/pdf", "accept-ranges": "bytes" },
    });
  });
  return requests;
}
