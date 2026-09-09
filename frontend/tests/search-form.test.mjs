import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("search form only exposes ZIP and street-address modes", () => {
  const searchFormPath = path.join(process.cwd(), "components", "search-form.tsx");
  const content = fs.readFileSync(searchFormPath, "utf8");

  assert.match(content, /ZIP Code/);
  assert.match(content, /Street Address/);
  assert.match(content, /AddressAutocompleteField/);
  assert.doesNotMatch(content, /Auto Detect/);
});

test("next config bridges VITE and NEXT_PUBLIC Mapbox tokens", () => {
  const configPath = path.join(process.cwd(), "next.config.ts");
  const content = fs.readFileSync(configPath, "utf8");

  assert.match(content, /VITE_MAPBOX_TOKEN/);
  assert.match(content, /NEXT_PUBLIC_MAPBOX_TOKEN/);
});
