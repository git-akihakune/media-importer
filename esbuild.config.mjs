import esbuild from "esbuild";
import { existsSync, readFileSync } from "fs";
import path from "path";

const prod = process.argv[2] === "--production";

const cssPlugin = {
  name: "css",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = readFileSync(args.path, "utf8");
      const result = await esbuild.transform(css, { loader: "css" });
      return { loader: "js", contents: `const css = ${JSON.stringify(result.code)}; export default css;` };
    });
  },
};

esbuild
  .build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr"],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod,
    plugins: [cssPlugin],
  })
  .catch(() => process.exit(1));