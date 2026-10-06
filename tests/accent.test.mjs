import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ACCENT,
  SHADES,
  SURFACES,
  brandRamp,
  contrast,
  luminance,
  parseColor,
  toHex,
} from "../src/accent.ts";

const white = { r: 255, g: 255, b: 255 };
const rgb = (hex) => parseColor(hex);
// macOS accent colours, Windows' default and a few that are hard: black, white, pure blue, yellow, cyan.
const accents = [
  "#007aff", "#a550a7", "#f74f9e", "#ff5257", "#f7821b", "#ffc600", "#62ba46", "#8c8c8c",
  "#0078d4", "#ffb900", "#000000", "#ffffff", "#0000ff", "#ffff00", "#00ffff", "#e6e6e6", "#202020", "#ff0000",
];

test("colours parse from hex, rgb() and color(srgb), and anything else is refused", () => {
  assert.deepEqual(parseColor("#f80"), { r: 255, g: 136, b: 0 });
  assert.deepEqual(parseColor("#0078D4"), { r: 0, g: 120, b: 212 });
  assert.deepEqual(parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30 });
  assert.deepEqual(parseColor("rgba(10 20 30 / 0.5)"), { r: 10, g: 20, b: 30 });
  assert.deepEqual(parseColor("color(srgb 1 0.5 0)"), { r: 255, g: 128, b: 0 });
  for (const bad of ["", "red", "AccentColor", "#12", "#12345", "rgb(a,b,c)", null, undefined])
    assert.equal(parseColor(bad), null, String(bad));
  assert.equal(toHex({ r: 255, g: 136, b: 0 }), "#ff8800");
});

test("contrast and luminance follow the WCAG definitions", () => {
  assert.equal(luminance(white), 1);
  assert.equal(luminance({ r: 0, g: 0, b: 0 }), 0);
  assert.ok(Math.abs(contrast(white, { r: 0, g: 0, b: 0 }) - 21) < 1e-9);
  assert.ok(Math.abs(contrast({ r: 119, g: 119, b: 119 }, white) - 4.48) < 0.01);
});

test("every accent gives a ramp that keeps buttons and brand text readable on the dark surfaces", () => {
  for (const accent of [...accents, DEFAULT_ACCENT]) {
    const ramp = brandRamp(accent);
    for (const shade of SHADES) assert.match(ramp[shade], /^#[0-9a-f]{6}$/, `${accent} ${shade}`);
    // White text on the button backgrounds (normal 70, hover 80, selected 60, pressed 40).
    for (const shade of [40, 60, 70, 80])
      assert.ok(contrast(white, rgb(ramp[shade])) >= 4.5, `${accent}: white on ${shade} ${ramp[shade]}`);
    // The button stands out from the surface it sits on.
    for (const surface of SURFACES)
      assert.ok(contrast(rgb(ramp[70]), rgb(surface)) >= 1.9, `${accent}: button 70 vs ${surface}`);
    // Brand coloured text and links (shades 100 and 110) on every surface.
    for (const shade of [100, 110])
      for (const surface of SURFACES)
        assert.ok(contrast(rgb(ramp[shade]), rgb(surface)) >= 4.5, `${accent}: text ${shade} ${ramp[shade]} on ${surface}`);
    // Lighter as the number rises.
    for (let i = 1; i < SHADES.length; i++)
      assert.ok(
        luminance(rgb(ramp[SHADES[i]])) > luminance(rgb(ramp[SHADES[i - 1]])),
        `${accent}: shade ${SHADES[i]} is not lighter than ${SHADES[i - 1]}`,
      );
  }
});

test("the ramp keeps the hue of a colourful accent and stays grey for a grey one", () => {
  const hue = (hex) => {
    const { r, g, b } = rgb(hex);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const diff = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  for (const accent of ["#007aff", "#f7821b", "#62ba46", "#a550a7"])
    for (const shade of [60, 80, 100, 110]) {
      const ramp = brandRamp(accent);
      assert.ok(diff(hue(ramp[shade]), hue(accent)) < 12, `${accent} shade ${shade}: ${ramp[shade]}`);
    }
  for (const shade of SHADES) {
    const { r, g, b } = rgb(brandRamp("#8c8c8c")[shade]);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 2, `grey shade ${shade}`);
  }
});

test("a bad colour falls back to the default accent", () => {
  assert.deepEqual(brandRamp("not a colour"), brandRamp(DEFAULT_ACCENT));
});

test("the default accent is orange", () => {
  const { r, g, b } = rgb(DEFAULT_ACCENT);
  assert.ok(r > g && g > b && r > 200 && g > 90 && g < 180 && b < 80);
  const text = rgb(brandRamp(DEFAULT_ACCENT)[100]);
  assert.ok(text.r > text.g && text.g > text.b, "brand text stays orange");
});
