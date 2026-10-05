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
