// Bundles src/main.ts into a single dist/Code.js that Apps Script can run,
// and copies the manifest next to it.
import { copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/Code.js",
  bundle: true,
  format: "iife",
  target: "es2019",
  legalComments: "none",
  // Apps Script finds doGet and doPost by name and its editor lists only functions declared at the top level of the
  // file, so these plain declarations hand over to the bundled functions.
  footer: {
    js: [
      "function doGet(e) { return globalThis.__binDay.doGet(e); }",
      "function doPost(e) { return globalThis.__binDay.doPost(e); }",
      "function testFetchRequest() { return globalThis.__binDay.testFetchRequest(); }",
      "",
    ].join("\n"),
  },
});
copyFileSync("appsscript.json", "dist/appsscript.json");
