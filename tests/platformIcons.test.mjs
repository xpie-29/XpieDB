import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// The built-in platform names come from the database migration, not from the code under test.
const sql = readFileSync("src-tauri/migrations/002_library.sql", "utf8");
const block = sql.slice(
  sql.indexOf("INSERT INTO platforms"),
  sql.indexOf("CREATE TABLE games"),
);
const builtins = [...block.matchAll(/\('([^']+)', '([^']+)'/g)].map((m) => m[1]);
const source = readFileSync("src/platformIcons.ts", "utf8");

test("the migration lists the 20 built-in platforms", () => {
  assert.equal(builtins.length, 20);
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
  "Nintendo 3DS": "#D4145A",
  PlayStation: "#9C9FA5",
  "PlayStation 2": "#3B46C4",
  "PlayStation 3": "#5C7FA8",
  "PlayStation 4": "#1450B8",
  "PlayStation 5": "#0070D1",
  Xbox: "#A6D608",
  "Xbox 360": "#7AC143",
  "Xbox Series S/X": "#2FA84F",
  Steam: "#66C0F4",
  PC: "#00B7C3",
  Dreamcast: "#F47B20",
};

test("every built-in platform is tinted exactly as in the colour chart", () => {
  assert.deepEqual(Object.keys(chart).sort(), [...builtins].sort());
  for (const [name, hex] of Object.entries(chart)) {
    const key = /^[A-Za-z_]+$/.test(name) ? name : `"${name}"`;
    const entry = source
      .split("\n")
      .find((line) => line.trimStart().startsWith(`${key}: {`));
    assert.ok(entry, `no entry for ${name}`);
    assert.ok(entry.includes(`tint: "${hex}"`), `${name} should be ${hex}: ${entry}`);
  }
});
