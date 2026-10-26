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
  target: "es2022",
  legalComments: "none",
});
copyFileSync("appsscript.json", "dist/appsscript.json");
