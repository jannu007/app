// src/*.ts を js/ にバンドルする（esbuild）。出力はリポジトリにコミットし、
// GitHub Pages などの静的ホスティングにビルド工程なしでそのまま配置できるようにする。
import { build } from "esbuild";

const common = {
  bundle: true,
  minify: true,
  target: ["es2020", "safari15"],
  legalComments: "eof",
  logLevel: "info",
};

await build({ ...common, entryPoints: ["src/main.ts"], outfile: "js/app.js", format: "iife" });
await build({ ...common, entryPoints: ["src/recorder-worklet.ts"], outfile: "js/recorder-worklet.js", format: "iife" });
