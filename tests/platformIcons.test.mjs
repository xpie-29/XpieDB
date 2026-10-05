import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// The built-in platform names come from the database migration, not from the code under test.
const original = readFileSync("src-tauri/migrations/002_library.sql", "utf8");
const later = readFileSync("src-tauri/migrations/005_more_platforms.sql", "utf8");
const names = (sql, from, to) =>
  [...sql.slice(sql.indexOf(from), sql.indexOf(to)).matchAll(/\('([^']+)', '([^']+)'/g)].map(
    (m) => m[1],
  );
const builtins = [
  ...names(original, "INSERT INTO platforms", "CREATE TABLE games"),
  ...names(later, "INSERT INTO platforms", "ON CONFLICT"),
];
const source = readFileSync("src/platformIcons.ts", "utf8");

test("the migrations list the 35 built-in platforms", () => {
  assert.equal(builtins.length, 35);
  assert.equal(new Set(builtins).size, 35);
});

test("every built-in platform has a bundled icon entry", () => {
  for (const name of builtins) {
    const key = /^[A-Za-z_]+$/.test(name) ? name : `"${name}"`;
    assert.ok(
      source.includes(`${key}: {`),
      `no bundled icon entry for ${name}`,
    );
  }
});

test("every imported icon file exists and carries no script", () => {
  const files = new Set(readdirSync("src/platformIcons"));
  const imports = [...source.matchAll(/from "\.\/platformIcons\/([^"]+)"/g)];
  assert.ok(imports.length > 0);
  for (const [, file] of imports) {
    assert.ok(files.has(file), `missing ${file}`);
    const svg = readFileSync(`src/platformIcons/${file}`, "utf8");
    assert.match(svg, /^<svg[\s>]/);
    assert.doesNotMatch(svg, /<script|onload=|href=/i);
  }
});

// Colours from the owner's chart (platform_icon_colors.xlsx), by the app's platform names.
const chart = {
  "Nintendo Entertainment System": "#B5121B",
  "Super Nintendo": "#9A8AC8",
  "Nintendo 64": "#1F9D55",
  GameCube: "#6A5FBB",
  Wii: "#8FD3F4",
  "Wii U": "#009AC7",
  "Nintendo Switch": "#E60012",
  "Nintendo Switch 2": "#FF5F55",
  "Virtual Boy": "#FF2A00",
  "Game Boy": "#8BAC0F",
  "Game Boy Color": "#F2C200",
  "Game Boy Advance": "#4B2E9E",
  "Nintendo DS": "#7F8C99",
  "Nintendo 3DS": "#D4145A",
  PlayStation: "#9C9FA5",
  "PlayStation 2": "#3B46C4",
  "PlayStation 3": "#5C7FA8",
  "PlayStation 4": "#1450B8",
  "PlayStation 5": "#0070D1",
  "PlayStation Portable": "#6F7FB3",
  "PlayStation Vita": "#4D8FE8",
  Xbox: "#A6D608",
  "Xbox 360": "#7AC143",
  "Xbox One": "#107C10",
  "Xbox Series S/X": "#2FA84F",
  "Sega Master System": "#D0312D",
  "Sega Genesis / Mega Drive": "#0060A8",
  "Sega CD": "#3F8FCB",
  "Sega 32X": "#E2582A",
  "Sega Saturn": "#3AA6A6",
  Dreamcast: "#F47B20",
  "Game Gear": "#1F7A8C",
  Steam: "#66C0F4",
  "Steam Deck": "#1A9FFF",
  PC: "#00B7C3",
};

// Chart colours below 3:1 contrast on the dark background were lightened (same hue).
const nudged = {
  "Nintendo Entertainment System": "#EB333D",
  GameCube: "#7C73C3",
  "Nintendo 3DS": "#EB296F",
  "PlayStation 2": "#6C74D3",
  "PlayStation 4": "#397AEA",
  "PlayStation 5": "#007EEB",
  "Game Boy Advance": "#866BD4",
  "Xbox One": "#139313",
  "Sega Master System": "#D84D49",
  "Sega Genesis / Mega Drive": "#007FDE",
  "Game Gear": "#23899D",
};

const lines = source.split("\n");
const entryFor = (name) => {
  const key = /^[A-Za-z_]+$/.test(name) ? name : `"${name}"`;
  return lines.find((line) => line.trimStart().startsWith(`${key}: {`));
};

test("every built-in platform is tinted from the colour chart, with only the listed dark-mode nudges", () => {
  assert.deepEqual(Object.keys(chart).sort(), [...builtins].sort());
  for (const [name, hex] of Object.entries(chart)) {
    const expected = nudged[name] ?? hex;
    const entry = entryFor(name);
    assert.ok(entry, `no entry for ${name}`);
    assert.ok(entry.includes(`tint: "${expected}"`), `${name} should be ${expected}: ${entry}`);
  }
});

test("a nudged colour keeps its hue and is lighter than the chart colour", () => {
  const hsl = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: ((h * 60 + 360) % 360), l };
  };
  for (const [name, hex] of Object.entries(nudged)) {
    const before = hsl(chart[name]);
    const after = hsl(hex);
    assert.ok(after.l > before.l, `${name} should be lighter`);
    assert.ok(Math.abs(after.h - before.h) < 4, `${name} hue moved: ${before.h} to ${after.h}`);
  }
});
