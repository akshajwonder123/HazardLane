import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("layout suppresses hydration warnings on the root elements", () => {
  const layoutPath = path.join(process.cwd(), "app", "layout.tsx");
  const content = fs.readFileSync(layoutPath, "utf8");

  assert.match(content, /<html[^>]*suppressHydrationWarning/);
  assert.match(content, /<body[^>]*suppressHydrationWarning/);
});
