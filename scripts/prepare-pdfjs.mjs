// Copies the parts of PDF.js that the reader loads at run time (fonts, character maps, colour profiles and the
// WebAssembly image decoders used by scanned pages) into public/pdfjs, so they ship with the app and work
// offline. public/pdfjs is generated, not committed. Run automatically before dev and build.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "public", "pdfjs");
if (!existsSync(from)) {
  console.error("pdfjs-dist is not installed; run npm install first.");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  if (existsSync(join(from, dir))) cpSync(join(from, dir), join(to, dir), { recursive: true });
}
