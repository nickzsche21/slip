import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
const root = path.resolve(__dirname, ".."), dist = path.join(root, "dist");
async function main() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  await build({ entryPoints: [path.join(root, "src/app.ts")], bundle: true, minify: true, format: "iife", target: "es2020", outfile: path.join(dist, "app.js") });
  for (const f of ["index.html", "style.css"]) fs.copyFileSync(path.join(root, f), path.join(dist, f));
  console.log(`dist: app.js ${(fs.statSync(path.join(dist, "app.js")).size / 1024).toFixed(1)} KB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
