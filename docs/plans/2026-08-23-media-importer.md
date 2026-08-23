# Media Importer Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Build an Obsidian plugin that scans notes for external media URLs, downloads (or uploads to a remote backend) the media, and rewrites the URLs to point at the new location.

**Architecture:** Single-pass stream pipeline (`Scanner -> Filter -> Downloader -> Backend.put -> Rewriter`) with the storage backend as the only pluggable seam. Three first-party backends (Local, WebDAV, S3) implementing a common `Backend` interface. Pure logic (scanner, filter, rewriter, url utils, backend URL construction) is kept free of Obsidian imports so it can be unit-tested in isolation. Obsidian-coupled code (plugin lifecycle, settings UI, status bar, modal, `requestUrl`, `Vault`) is wrapped behind small interfaces that tests mock at the boundary.

**Tech Stack:** TypeScript (strict), esbuild (bundler), Vitest (tests), ESLint (lint). Runtime dep: `minio` (lightweight S3-compatible client). WebDAV uses Obsidian's `requestUrl` (no extra dep). Obsidian API `^1.5.0`. Targets ES2018 / CommonJS (Obsidian's requirement).

**Key design decisions (approved in brainstorm):**
- All embed syntaxes supported, each toggleable; default = Markdown `![]()` only.
- Allowlist (default `["*"]`) + denylist (default `[]`) + optional size limit (default off).
- Idempotency via `Backend.selfProduced(url)` — the note's content is the source of truth, no external cache.
- Filename = URL basename + `-N` collision suffix.
- Storage backends pluggable; Local + WebDAV + S3 first-party.
- In scope: Progress UI (status bar + modal), Dry-run mode.
- Out of scope (v1): mobile support guarantee, undo/rollback, retry, parallelism, CI workflow.

---

## Task 0: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `.eslintrc.cjs`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/main.ts` (placeholder so build works)
- Create: `src/__tests__/.gitkeep`

**Step 1: Write `package.json`**

```json
{
  "name": "media-importer",
  "version": "0.1.0",
  "description": "Obsidian plugin to download remote media into the vault or to a remote backend.",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs --production",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.20.0",
    "eslint": "^8.57.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  },
  "dependencies": {
    "minio": "^8.0.0"
  }
}
```

**Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2018",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2018", "DOM"],
    "types": ["node"],
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "src/__tests__/**/*.ts"]
}
```

**Step 3: Write `esbuild.config.mjs`**

```js
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
```

**Step 4: Write `manifest.json`**

```json
{
  "id": "media-importer",
  "name": "Media Importer",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Download remote media referenced in your notes and store it locally or on a remote backend (WebDAV, S3).",
  "author": "Your Name",
  "authorUrl": "",
  "isDesktopOnly": false
}
```

**Step 5: Write `versions.json`**

```json
{
  "0.1.0": "1.5.0"
}
```

**Step 6: Write `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2020, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
  ignorePatterns: ["main.js", "node_modules", ".git"],
};
```

**Step 7: Write `.gitignore`**

```
node_modules/
main.js
*.log
.DS_Store
coverage/
.vitest-cache/
```

**Step 8: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
});
```

**Step 9: Write `src/main.ts` placeholder**

```ts
export default class MediaImporterPlugin {
  // placeholder — replaced in Task 12
}
```

**Step 10: Install deps and verify build pipeline**

Run: `npm install`
Expected: completes; `minio` and dev deps installed.

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all four succeed (no tests yet, vitest reports "no test files found" but exits 0; esbuild produces `main.js`).

**Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold project (package.json, tsconfig, esbuild, manifest, vitest, eslint)"
```

---

## Task 1: URL utilities

Pure module with no Obsidian dependency. Foundation for scanner, rewriter, and backends.

**Files:**
- Create: `src/url.ts`
- Test: `src/__tests__/url.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/url.test.ts
import { describe, it, expect } from "vitest";
import {
  isExternalUrl,
  urlBasename,
  collisionSuffix,
  joinVaultPath,
  hasMediaExtension,
  MEDIA_EXTENSIONS,
} from "../url";

describe("isExternalUrl", () => {
  it("returns true for http and https", () => {
    expect(isExternalUrl("http://example.com/a.png")).toBe(true);
    expect(isExternalUrl("https://example.com/a.png")).toBe(true);
  });
  it("returns false for app://, file://, wikilinks, relative paths", () => {
    expect(isExternalUrl("app://local/x.png")).toBe(false);
    expect(isExternalUrl("file:///x.png")).toBe(false);
    expect(isExternalUrl("media/x.png")).toBe(false);
    expect(isExternalUrl("[[media/x.png]]")).toBe(false);
  });
  it("returns false for non-string and empty", () => {
    expect(isExternalUrl("")).toBe(false);
  });
});

describe("urlBasename", () => {
  it("extracts last path segment with query stripped", () => {
    expect(urlBasename("https://example.com/foo/cat.png?x=1")).toBe("cat.png");
  });
  it("extracts basename when no extension", () => {
    expect(urlBasename("https://example.com/foo/bar")).toBe("bar");
  });
  it("returns 'file' when URL ends with slash", () => {
    expect(urlBasename("https://example.com/foo/")).toBe("file");
  });
  it("returns 'file' when URL has no path", () => {
    expect(urlBasename("https://example.com")).toBe("file");
  });
});

describe("collisionSuffix", () => {
  it("returns the name unchanged when not in existing set", () => {
    expect(collisionSuffix("cat.png", new Set())).toBe("cat.png");
    expect(collisionSuffix("cat.png", new Set(["dog.png"]))).toBe("cat.png");
  });
  it("appends -1, -2 before extension when colliding", () => {
    expect(collisionSuffix("cat.png", new Set(["cat.png"]))).toBe("cat-1.png");
    expect(collisionSuffix("cat.png", new Set(["cat.png", "cat-1.png"]))).toBe("cat-2.png");
    expect(collisionSuffix("cat.png", new Set(["cat.png", "cat-1.png", "cat-2.png"]))).toBe("cat-3.png");
  });
  it("handles no-extension names", () => {
    expect(collisionSuffix("bar", new Set(["bar"]))).toBe("bar-1");
  });
});

describe("joinVaultPath", () => {
  it("joins with forward slash and trims leading slash", () => {
    expect(joinVaultPath("media", "cat.png")).toBe("media/cat.png");
    expect(joinVaultPath("/media", "cat.png")).toBe("media/cat.png");
    expect(joinVaultPath("", "cat.png")).toBe("cat.png");
  });
});

describe("hasMediaExtension", () => {
  it("matches image and av extensions case-insensitively", () => {
    expect(hasMediaExtension("cat.PNG")).toBe(true);
    expect(hasMediaExtension("song.MP3")).toBe(true);
    expect(hasMediaExtension("page.html")).toBe(false);
    expect(hasMediaExtension("noext")).toBe(false);
  });
});

describe("MEDIA_EXTENSIONS", () => {
  it("includes common image, audio, video extensions", () => {
    expect(MEDIA_EXTENSIONS.has("png")).toBe(true);
    expect(MEDIA_EXTENSIONS.has("mp4")).toBe(true);
    expect(MEDIA_EXTENSIONS.has("mp3")).toBe(true);
    expect(MEDIA_EXTENSIONS.has("html")).toBe(false);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/url.test.ts`
Expected: FAIL — module `../url` does not exist.

**Step 3: Implement `src/url.ts`**

```ts
// src/url.ts

export const MEDIA_EXTENSIONS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico", "tiff",
  // audio
  "mp3", "ogg", "wav", "flac", "aac", "m4a", "opus",
  // video
  "mp4", "webm", "mov", "mkv", "avi", "m4v",
]);

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function urlBasename(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const last = path.split("/").filter(Boolean).pop();
    return last ?? "file";
  } catch {
    const clean = url.split("?")[0].split("#")[0];
    const last = clean.split("/").filter(Boolean).pop();
    return last ?? "file";
  }
}

export function collisionSuffix(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 1;
  let candidate = `${stem}-${i}${ext}`;
  while (existing.has(candidate)) {
    i++;
    candidate = `${stem}-${i}${ext}`;
  }
  return candidate;
}

export function joinVaultPath(folder: string, name: string): string {
  const f = folder.replace(/^\/+|\/+$/g, "");
  if (!f) return name;
  return `${f}/${name}`;
}

export function hasMediaExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/url.test.ts`
Expected: PASS — all describe blocks green.

**Step 5: Commit**

```bash
git add src/url.ts src/__tests__/url.test.ts
git commit -m "feat(url): add URL utility module with tests"
```

---

## Task 2: Scanner — types + Markdown detectors

Scanner is the first part of the pipeline. We define shared `MediaRef` in `types.ts` and implement the Markdown image/audio/video detector (default on).

**Files:**
- Create: `src/types.ts`
- Create: `src/scanner.ts`
- Test: `src/__tests__/scanner.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/scanner.test.ts
import { describe, it, expect } from "vitest";
import { scanNote, ScannerConfig } from "../scanner";

const cfg = (overrides: Partial<ScannerConfig> = {}): ScannerConfig => ({
  mdImage: true,
  mdAv: true,
  wikilink: false,
  htmlImg: false,
  htmlAv: false,
  ...overrides,
});

describe("scanNote — markdown image", () => {
  it("finds a single external image", () => {
    const note = "![cat](https://example.com/cat.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      url: "https://example.com/cat.png",
      kind: "md-image",
      rawStart: 0,
      rawEnd: note.length,
      rawMatch: note,
    });
  });
  it("finds multiple images on different lines", () => {
    const note = "![a](https://x.com/a.png)\n![b](https://x.com/b.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(2);
    expect(refs[0].url).toBe("https://x.com/a.png");
    expect(refs[1].url).toBe("https://x.com/b.png");
  });
  it("ignores non-image markdown links", () => {
    const note = "[not an image](https://example.com/page.html)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(0);
  });
  it("ignores local/vault paths", () => {
    const note = "![local](media/cat.png) ![app](app://local/x.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(0);
  });
});

describe("scanNote — markdown audio/video", () => {
  it("finds mp4 and mp3 embeds", () => {
    const note = "![](https://example.com/clip.mp4)\n![](https://example.com/song.mp3)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(2);
    expect(refs[0].kind).toBe("md-av");
    expect(refs[1].kind).toBe("md-av");
  });
  it("does not treat non-media extension ![]() as av when mdImage disabled", () => {
    const note = "![alt](https://example.com/photo.png)";
    const refs = scanNote(note, cfg({ mdImage: false }));
    expect(refs).toHaveLength(0);
  });
});

describe("scanNote — detector toggles", () => {
  it("respects mdImage=false", () => {
    const note = "![a](https://x.com/a.png)";
    expect(scanNote(note, cfg({ mdImage: false }))).toHaveLength(0);
  });
  it("respects mdAv=false", () => {
    const note = "![](https://x.com/clip.mp4)";
    expect(scanNote(note, cfg({ mdAv: false }))).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/scanner.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Write `src/types.ts`**

```ts
// src/types.ts

export type MediaKind =
  | "md-image"
  | "md-av"
  | "wikilink"
  | "html-img"
  | "html-source";

export interface MediaRef {
  notePath: string;       // set by Scanner.walk, left empty by scanNote
  rawMatch: string;      // exact text of the embed in the note
  rawStart: number;      // byte offset into note text (0-based, inclusive)
  rawEnd: number;        // exclusive end offset
  url: string;           // normalized external URL
  kind: MediaKind;
}

export interface Dropped {
  ref: MediaRef;
  reason: "denylist" | "not-in-allowlist" | "too-large" | "already-local" | "unknown";
}

export interface Failed {
  ref: MediaRef;
  error: string;
}

export interface RunReport {
  scannedNotes: number;
  candidates: number;
  downloaded: number;
  rewritten: number;
  dropped: Dropped[];
  failed: Failed[];
  dryRun: boolean;
}

export interface RunContext {
  dryRun: boolean;
}
```

**Step 4: Write `src/scanner.ts`**

```ts
// src/scanner.ts
import { MediaRef, MediaKind } from "./types";
import { isExternalUrl, hasMediaExtension } from "./url";

export interface ScannerConfig {
  mdImage: boolean;
  mdAv: boolean;
  wikilink: boolean;
  htmlImg: boolean;
  htmlAv: boolean;
}

// Matches ![alt](url) — captures alt text (any) and url (non-whitespace, no closing paren)
const MD_EMBED_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function scanNote(note: string, cfg: ScannerConfig): MediaRef[] {
  const refs: MediaRef[] = [];

  if (cfg.mdImage || cfg.mdAv) {
    for (const m of note.matchAll(MD_EMBED_RE)) {
      const raw = m[0];
      const url = m[2];
      if (!isExternalUrl(url)) continue;
      const isMedia = hasMediaExtension(url);
      if (isMedia && cfg.mdAv) {
        pushRef(refs, url, "md-av", m.index!, raw);
      else if (isMedia && cfg.mdImage) {
        // image with media extension — counts as md-image unless mdAv handled it
        pushRef(refs, url, "md-image", m.index!, raw);
      } else if (!isMedia && cfg.mdImage) {
        // ![]() with non-media extension: treat as image only if mdImage enabled
        // (allows users who paste a raw png URL without extension by content-type)
        pushRef(refs, url, "md-image", m.index!, raw);
      }
    }
  }

  return refs;
}

function pushRef(refs: MediaRef[], url: string, kind: MediaKind, start: number, raw: string): void {
  refs.push({
    notePath: "",
    rawMatch: raw,
    rawStart: start,
    rawEnd: start + raw.length,
    url,
    kind,
  });
}
```

Wait — there's a bug above: an image-with-media-extension should be classified as `md-image`, not `md-av`. Audio/video extensions are mp3/mp4/ogg/etc; image extensions are png/jpg/etc. The current `hasMediaExtension` returns true for both. Let me split: `mdImage` matches image extensions; `mdAv` matches audio/video extensions.

Re-test expectations to confirm intent:
- `![cat](https://example.com/cat.png)` with both detectors on → `md-image`.
- `![](https://example.com/clip.mp4)` with both detectors on → `md-av`.

So I need separate `hasImageExtension` and `hasAvExtension` helpers. Let me revise the plan.

**Step 4 (revised): Add image/av split to `url.ts` first**

Modify `src/url.ts`: add `IMAGE_EXTENSIONS`, `AV_EXTENSIONS`, `hasImageExtension`, `hasAvExtension`, and keep `hasMediaExtension` as union.

Add to `src/__tests__/url.test.ts`:

```ts
import { IMAGE_EXTENSIONS, AV_EXTENSIONS, hasImageExtension, hasAvExtension } from "../url";

describe("hasImageExtension / hasAvExtension", () => {
  it("separates image vs av", () => {
    expect(hasImageExtension("cat.png")).toBe(true);
    expect(hasImageExtension("song.mp3")).toBe(false);
    expect(hasAvExtension("song.mp3")).toBe(true);
    expect(hasAvExtension("cat.png")).toBe(false);
  });
});
```

Modify `src/url.ts` — replace `MEDIA_EXTENSIONS` usage:

```ts
export const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico", "tiff",
]);

export const AV_EXTENSIONS = new Set([
  "mp3", "ogg", "wav", "flac", "aac", "m4a", "opus",
  "mp4", "webm", "mov", "mkv", "avi", "m4v",
]);

export const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...AV_EXTENSIONS]);

export function hasImageExtension(name: string): boolean {
  return hasExtensionIn(name, IMAGE_EXTENSIONS);
}

export function hasAvExtension(name: string): boolean {
  return hasExtensionIn(name, AV_EXTENSIONS);
}

export function hasMediaExtension(name: string): boolean {
  return hasExtensionIn(name, MEDIA_EXTENSIONS);
}

function hasExtensionIn(name: string, set: Set<string>): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return set.has(name.slice(dot + 1).toLowerCase());
}
```

**Step 5: Rewrite `src/scanner.ts` cleanly**

```ts
// src/scanner.ts
import { MediaRef, MediaKind } from "./types";
import { isExternalUrl, hasImageExtension, hasAvExtension } from "./url";

export interface ScannerConfig {
  mdImage: boolean;
  mdAv: boolean;
  wikilink: boolean;
  htmlImg: boolean;
  htmlAv: boolean;
}

const MD_EMBED_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function scanNote(note: string, cfg: ScannerConfig): MediaRef[] {
  const refs: MediaRef[] = [];

  if (cfg.mdImage || cfg.mdAv) {
    for (const m of note.matchAll(MD_EMBED_RE)) {
      const raw = m[0];
      const url = m[2];
      if (!isExternalUrl(url)) continue;
      let kind: MediaKind | null = null;
      if (hasAvExtension(url) && cfg.mdAv) kind = "md-av";
      else if (hasImageExtension(url) && cfg.mdImage) kind = "md-image";
      else if (!hasAvExtension(url) && !hasImageExtension(url) && cfg.mdImage) kind = "md-image";
      if (kind) {
        refs.push({
          notePath: "",
          rawMatch: raw,
          rawStart: m.index!,
          rawEnd: m.index! + raw.length,
          url,
          kind,
        });
      }
    }
  }

  return refs;
}
```

**Step 6: Run tests to verify pass**

Run: `npm run test -- src/__tests__/scanner.test.ts src/__tests__/url.test.ts`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/types.ts src/scanner.ts src/url.ts src/__tests__/scanner.test.ts src/__tests__/url.test.ts
git commit -m "feat(scanner): add Markdown image/av detectors with shared types"
```

---

## Task 3: Scanner — Wikilink and HTML detectors

Add the remaining three detectors: `![[url]]`, `<img src>`, `<video|audio ...><source src>` / inline `src`. All off by default.

**Files:**
- Modify: `src/scanner.ts`
- Modify: `src/__tests__/scanner.test.ts`

**Step 1: Append failing tests**

```ts
// append to src/__tests__/scanner.test.ts

describe("scanNote — wikilink", () => {
  it("finds ![[https://...]] embeds", () => {
    const note = "![[https://example.com/cat.png]]";
    const refs = scanNote(note, cfg({ wikilink: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      url: "https://example.com/cat.png",
      kind: "wikilink",
      rawMatch: note,
    });
  });
  it("ignores internal wikilinks to vault paths", () => {
    const note = "![[media/cat.png]]";
    const refs = scanNote(note, cfg({ wikilink: true }));
    expect(refs).toHaveLength(0);
  });
});

describe("scanNote — html img", () => {
  it("finds <img src='https://...'>", () => {
    const note = `<img src='https://example.com/cat.png' alt='cat'>`;
    const refs = scanNote(note, cfg({ htmlImg: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ url: "https://example.com/cat.png", kind: "html-img" });
  });
  it("finds <img src=\"https://...\">", () => {
    const note = `<img src="https://example.com/cat.png">`;
    const refs = scanNote(note, cfg({ htmlImg: true }));
    expect(refs).toHaveLength(1);
  });
  it("ignores local img src", () => {
    const note = `<img src="media/cat.png">`;
    const refs = scanNote(note, cfg({ htmlImg: true }));
    expect(refs).toHaveLength(0);
  });
});

describe("scanNote — html av", () => {
  it("finds <video src='https://...'>", () => {
    const note = `<video src='https://example.com/clip.mp4'></video>`;
    const refs = scanNote(note, cfg({ htmlAv: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ url: "https://example.com/clip.mp4", kind: "html-source" });
  });
  it("finds <audio><source src='https://...'></audio>", () => {
    const note = `<audio controls><source src='https://example.com/song.mp3' type='audio/mpeg'></audio>`;
    const refs = scanNote(note, cfg({ htmlAv: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ url: "https://example.com/song.mp3", kind: "html-source" });
  });
});

describe("scanNote — combined detectors", () => {
  it("yields refs in scan order across detectors", () => {
    const note = [
      "![a](https://x.com/a.png)",
      "![[https://x.com/b.png]]",
      "<img src='https://x.com/c.png'>",
    ].join("\n");
    const refs = scanNote(note, cfg({ wikilink: true, htmlImg: true }));
    expect(refs.map(r => r.url)).toEqual([
      "https://x.com/a.png",
      "https://x.com/b.png",
      "https://x.com/c.png",
    ]);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/scanner.test.ts`
Expected: FAIL — wikilink/html tests fail (not implemented).

**Step 3: Extend `src/scanner.ts`**

Add wikilink and HTML detection. Final file:

```ts
// src/scanner.ts
import { MediaRef, MediaKind } from "./types";
import { isExternalUrl, hasImageExtension, hasAvExtension } from "./url";

export interface ScannerConfig {
  mdImage: boolean;
  mdAv: boolean;
  wikilink: boolean;
  htmlImg: boolean;
  htmlAv: boolean;
}

const MD_EMBED_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const WIKILINK_EMBED_RE = /!\[\[(https?:\/\/[^|\]]+)(?:\|[^\]]*)?\]\]/g;
const HTML_IMG_RE = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^'">\s]+))[^>]*>/gi;
const HTML_AV_RE = /<(?:video|audio|source)\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^'">\s]+))[^>]*>/gi;

export function scanNote(note: string, cfg: ScannerConfig): MediaRef[] {
  const refs: MediaRef[] = [];

  if (cfg.mdImage || cfg.mdAv) {
    for (const m of note.matchAll(MD_EMBED_RE)) {
      const url = m[2];
      if (!isExternalUrl(url)) continue;
      let kind: MediaKind | null = null;
      if (hasAvExtension(url) && cfg.mdAv) kind = "md-av";
      else if (hasImageExtension(url) && cfg.mdImage) kind = "md-image";
      else if (!hasAvExtension(url) && !hasImageExtension(url) && cfg.mdImage) kind = "md-image";
      if (kind) push(refs, url, kind, m.index!, m[0]);
    }
  }

  if (cfg.wikilink) {
    for (const m of note.matchAll(WIKILINK_EMBED_RE)) {
      const url = m[1];
      if (isExternalUrl(url)) push(refs, url, "wikilink", m.index!, m[0]);
    }
  }

  if (cfg.htmlImg) {
    for (const m of note.matchAll(HTML_IMG_RE)) {
      const url = m[1] ?? m[2] ?? m[3];
      if (url && isExternalUrl(url)) push(refs, url, "html-img", m.index!, m[0]);
    }
  }

  if (cfg.htmlAv) {
    for (const m of note.matchAll(HTML_AV_RE)) {
      const url = m[1] ?? m[2] ?? m[3];
      if (url && isExternalUrl(url)) push(refs, url, "html-source", m.index!, m[0]);
    }
  }

  refs.sort((a, b) => a.rawStart - b.rawStart);
  return refs;
}

function push(refs: MediaRef[], url: string, kind: MediaKind, start: number, raw: string): void {
  refs.push({ notePath: "", rawMatch: raw, rawStart: start, rawEnd: start + raw.length, url, kind });
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/scanner.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/scanner.ts src/__tests__/scanner.test.ts
git commit -m "feat(scanner): add wikilink and HTML detectors"
```

---

## Task 4: Scanner — vault walker

Wrap `scanNote` to walk vault files (filtered by `scanPaths`) and stamp `notePath`. Vault access goes through an injected `VaultAdapter` interface so tests stay free of Obsidian imports.

**Files:**
- Modify: `src/scanner.ts`
- Create: `src/vault-adapter.ts`
- Modify: `src/__tests__/scanner.test.ts` (or new `scanner-walk.test.ts`)

**Step 1: Write failing tests for `walkVault`**

```ts
// append to scanner.test.ts
import { walkVault, VaultAdapter, ScannerConfig as _SC } from "../scanner";

class FakeVault implements VaultAdapter {
  constructor(public files: { path: string; content: string }[]) {}
  async listMarkdownFiles(paths: string[]): Promise<string[]> {
    if (paths.length === 0) return this.files.map(f => f.path);
    return this.files
      .filter(f => paths.some(p => f.path.startsWith(p.replace(/\/$/, "") + "/") || f.path === p))
      .map(f => f.path);
  }
  async read(path: string): Promise<string> {
    return this.files.find(f => f.path === path)!.content;
  }
}

describe("walkVault", () => {
  it("yields refs stamped with notePath across files", async () => {
    const vault = new FakeVault([
      { path: "a.md", content: "![a](https://x.com/a.png)" },
      { path: "b.md", content: "no media here" },
      { path: "sub/c.md", content: "![c](https://x.com/c.png)" },
    ]);
    const refs = await walkVault(vault, [], cfg());
    expect(refs.map(r => r.notePath).sort()).toEqual(["a.md", "sub/c.md"]);
  });
  it("respects scanPaths filter", async () => {
    const vault = new FakeVault([
      { path: "keep/a.md", content: "![a](https://x.com/a.png)" },
      { path: "drop/b.md", content: "![b](https://x.com/b.png)" },
    ]);
    const refs = await walkVault(vault, ["keep"], cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].notePath).toBe("keep/a.md");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/scanner.test.ts`
Expected: FAIL — `walkVault` and `VaultAdapter` not exported.

**Step 3: Write `src/vault-adapter.ts`**

```ts
// src/vault-adapter.ts
// Thin interface wrapping the bits of Obsidian's Vault we need.
// The production implementation (in main.ts) maps these to app.vault calls.

export interface VaultAdapter {
  listMarkdownFiles(scanPaths: string[]): Promise<string[]>;
  read(path: string): Promise<string>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
  modifyText(path: string, content: string): Promise<void>;
}
```

**Step 4: Add `walkVault` to `src/scanner.ts`**

Append to `src/scanner.ts`:

```ts
import { VaultAdapter } from "./vault-adapter";

export async function walkVault(
  vault: VaultAdapter,
  scanPaths: string[],
  cfg: ScannerConfig,
): Promise<MediaRef[]> {
  const files = await vault.listMarkdownFiles(scanPaths);
  const all: MediaRef[] = [];
  for (const path of files) {
    const content = await vault.read(path);
    const refs = scanNote(content, cfg);
    for (const r of refs) r.notePath = path;
    all.push(...refs);
  }
  return all;
}
```

**Step 5: Run tests to verify pass**

Run: `npm run test -- src/__tests__/scanner.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/scanner.ts src/vault-adapter.ts src/__tests__/scanner.test.ts
git commit -m "feat(scanner): add walkVault over injected VaultAdapter"
```

---

## Task 5: Filter

Pure function applying allowlist, denylist, and (later) size. Size limit requires a `HEAD` request — we split: `filterByRules` (pure, no network) and `filterBySize` (async, returns kept + dropped). Importer calls both.

**Files:**
- Create: `src/filter.ts`
- Test: `src/__tests__/filter.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/filter.test.ts
import { describe, it, expect } from "vitest";
import { filterByRules, hostMatches } from "../filter";
import { MediaRef } from "../types";

const ref = (url: string): MediaRef => ({
  notePath: "x.md", rawMatch: url, rawStart: 0, rawEnd: url.length, url, kind: "md-image",
});

describe("hostMatches", () => {
  it("matches exact host and subdomain", () => {
    expect(hostMatches("cdn.example.com", "cdn.example.com")).toBe(true);
    expect(hostMatches("sub.cdn.example.com", "cdn.example.com")).toBe(true);
    expect(hostMatches("attacker.com/cdn.example.com", "cdn.example.com")).toBe(false);
  });
  it("matches regex when pattern starts and ends with /", () => {
    expect(hostMatches("i.imgur.com", "/^i\\.imgur\\.com$/")).toBe(true);
    expect(hostMatches("imgur.com", "/^i\\.imgur\\.com$/")).toBe(false);
  });
  it("matches wildcard * (= all)", () => {
    expect(hostMatches("anything.com", "*")).toBe(true);
  });
});

describe("filterByRules", () => {
  it("default allowlist [*] keeps everything not in denylist", () => {
    const refs = [ref("https://a.com/x.png"), ref("https://b.com/y.png")];
    const result = filterByRules(refs, { allowlist: ["*"], denylist: [] });
    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);
  });
  it("denylist drops matching host", () => {
    const refs = [ref("https://cdn.bad.com/x.png"), ref("https://good.com/y.png")];
    const result = filterByRules(refs, { allowlist: ["*"], denylist: ["bad.com"] });
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].url).toContain("good.com");
    expect(result.dropped[0].reason).toBe("denylist");
  });
  it("allowlist restricts to listed hosts", () => {
    const refs = [ref("https://keep.com/x.png"), ref("https://drop.com/y.png")];
    const result = filterByRules(refs, { allowlist: ["keep.com"], denylist: [] });
    expect(result.kept).toHaveLength(1);
    expect(result.dropped[0].reason).toBe("not-in-allowlist");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/filter.test.ts`
Expected: FAIL — module missing.

**Step 3: Implement `src/filter.ts`**

```ts
// src/filter.ts
import { MediaRef, Dropped } from "./types";

export interface FilterRules {
  allowlist: string[];
  denylist: string[];
}

export interface FilterResult {
  kept: MediaRef[];
  dropped: Dropped[];
}

export function hostMatches(host: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    try {
      const re = new RegExp(pattern.slice(1, -1));
      return re.test(host);
    } catch {
      return false;
    }
  }
  return host === pattern || host.endsWith("." + pattern);
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function filterByRules(refs: MediaRef[], rules: FilterRules): FilterResult {
  const kept: MediaRef[] = [];
  const dropped: Dropped[] = [];
  for (const ref of refs) {
    const host = urlHost(ref.url);
    if (rules.denylist.some(p => hostMatches(host, p))) {
      dropped.push({ ref, reason: "denylist" });
      continue;
    }
    if (rules.allowlist.length > 0 && !rules.allowlist.some(p => hostMatches(host, p))) {
      dropped.push({ ref, reason: "not-in-allowlist" });
      continue;
    }
    kept.push(ref);
  }
  return { kept, dropped };
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/filter.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/filter.ts src/__tests__/filter.test.ts
git commit -m "feat(filter): add allowlist/denylist rule filter"
```

---

## Task 6: Size filter (async, needs HEAD)

`filterBySize` takes the kept refs and a `Requester` interface (one method `head(url) -> { contentLength: number | null }`). Returns refs that pass the size cap and drops the rest as `too-large`. When `sizeLimitMB` is null, returns everything untouched.

**Files:**
- Modify: `src/filter.ts`
- Modify: `src/__tests__/filter.test.ts`

**Step 1: Append failing tests**

```ts
// append to src/__tests__/filter.test.ts
import { filterBySize } from "../filter";

interface HeadFn { head(url: string): Promise<{ contentLength: number | null }>; }

describe("filterBySize", () => {
  it("passes through when sizeLimitMB is null", async () => {
    const refs = [ref("https://x.com/a.png")];
    const r = await filterBySize(refs, null, { head: async () => ({ contentLength: 999 }) });
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
  });
  it("drops files over the cap", async () => {
    const refs = [ref("https://x.com/big.png"), ref("https://x.com/small.png")];
    const head: HeadFn = {
      head: async (url) => ({ contentLength: url.includes("big") ? 10 * 1024 * 1024 : 1024 }),
    };
    const r = await filterBySize(refs, 5, head); // 5MB cap
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].url).toContain("small");
    expect(r.dropped[0].reason).toBe("too-large");
  });
  it("keeps when contentLength is unknown (server didn't return it)", async () => {
    const refs = [ref("https://x.com/mystery.png")];
    const head: HeadFn = { head: async () => ({ contentLength: null }) };
    const r = await filterBySize(refs, 5, head);
    expect(r.kept).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/filter.test.ts`
Expected: FAIL — `filterBySize` missing.

**Step 3: Extend `src/filter.ts`**

Append:

```ts
export interface HeadRequester {
  head(url: string): Promise<{ contentLength: number | null }>;
}

export async function filterBySize(
  refs: MediaRef[],
  sizeLimitMB: number | null,
  head: HeadRequester,
): Promise<FilterResult> {
  if (sizeLimitMB === null) return { kept: refs, dropped: [] };
  const cap = sizeLimitMB * 1024 * 1024;
  const kept: MediaRef[] = [];
  const dropped: Dropped[] = [];
  for (const ref of refs) {
    const { contentLength } = await head.head(ref.url);
    if (contentLength !== null && contentLength > cap) {
      dropped.push({ ref, reason: "too-large" });
    } else {
      kept.push(ref);
    }
  }
  return { kept, dropped };
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/filter.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/filter.ts src/__tests__/filter.test.ts
git commit -m "feat(filter): add async size filter via HEAD"
```

---

## Task 7: Rewriter

Takes a note's original text + a list of `{ ref, newUrl }` pairs and performs reverse-order replacement using byte offsets. Preserves embed syntax family.

**Files:**
- Create: `src/rewriter.ts`
- Test: `src/__tests__/rewriter.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/rewriter.test.ts
import { describe, it, expect } from "vitest";
import { rewriteNote, Rewrite } from "../rewriter";

const rewrite = (note: string, rawMatch: string, url: string, newUrl: string): Rewrite => ({
  ref: { notePath: "x.md", rawMatch, rawStart: note.indexOf(rawMatch), rawEnd: note.indexOf(rawMatch) + rawMatch.length, url, kind: "md-image" },
  newUrl,
});

describe("rewriteNote", () => {
  it("replaces a single markdown image with a wikilink", () => {
    const note = "![cat](https://x.com/cat.png)";
    const r = rewriteNote(note, [rewrite(note, note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![cat](media/cat.png)");
  });
  it("replaces in reverse order so earlier offsets stay valid", () => {
    const note = "![a](https://x.com/a.png)\n![b](https://x.com/b.png)";
    const r = rewriteNote(note, [
      rewrite(note, "![a](https://x.com/a.png)", "https://x.com/a.png", "media/a.png"),
      rewrite(note, "![b](https://x.com/b.png)", "https://x.com/b.png", "media/b.png"),
    ]);
    expect(r).toBe("![a](media/a.png)\n![b](media/b.png)");
  });
  it("preserves wikilink syntax", () => {
    const note = "![[https://x.com/cat.png]]";
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/cat.png", kind: "wikilink" },
      newUrl: "media/cat.png",
    }]);
    expect(r).toBe("![[media/cat.png]]");
  });
  it("preserves html img syntax", () => {
    const note = `<img src="https://x.com/cat.png">`;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/cat.png", kind: "html-img" },
      newUrl: "https://cdn.example.com/cat.png",
    }]);
    expect(r).toBe(`<img src="https://cdn.example.com/cat.png">`);
  });
  it("returns original note when rewrites is empty", () => {
    expect(rewriteNote("unchanged", [])).toBe("unchanged");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/rewriter.test.ts`
Expected: FAIL — module missing.

**Step 3: Implement `src/rewriter.ts`**

```ts
// src/rewriter.ts
import { MediaRef } from "./types";

export interface Rewrite {
  ref: MediaRef;
  newUrl: string; // local vault path or remote URL — already resolved by backend
}

export function rewriteNote(note: string, rewrites: Rewrite[]): string {
  if (rewrites.length === 0) return note;
  const sorted = [...rewrites].sort((a, b) => b.ref.rawStart - a.ref.rawStart);
  let out = note;
  for (const { ref, newUrl } of sorted) {
    const replacement = buildReplacement(ref, newUrl);
    out = out.slice(0, ref.rawStart) + replacement + out.slice(ref.rawEnd);
  }
  return out;
}

function buildReplacement(ref: MediaRef, newUrl: string): string {
  switch (ref.kind) {
    case "md-image":
    case "md-av": {
      // Preserve alt text: extract from rawMatch
      const altMatch = /^!\[([^\]]*)\]\(/.exec(ref.rawMatch);
      const alt = altMatch ? altMatch[1] : "";
      return `![${alt}](${newUrl})`;
    }
    case "wikilink":
      return `![[${newUrl}]]`;
    case "html-img": {
      return ref.rawMatch.replace(/(\bsrc\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, `$1"${newUrl}"`);
    }
    case "html-source": {
      return ref.rawMatch.replace(/(\bsrc\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, `$1"${newUrl}"`);
    }
  }
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/rewriter.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/rewriter.ts src/__tests__/rewriter.test.ts
git commit -m "feat(rewriter): add offset-based note rewriter preserving syntax"
```

---

## Task 8: Storage backend interface + Local backend

Define the `Backend` interface and implement `LocalStorageBackend`. The backend takes an injected `VaultAdapter` so tests are Obsidian-free.

**Files:**
- Create: `src/storage/backend.ts`
- Create: `src/storage/local.ts`
- Test: `src/__tests__/storage/local.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/storage/local.test.ts
import { describe, it, expect } from "vitest";
import { LocalStorageBackend } from "../../storage/local";
import { MediaRef } from "../../types";
import { FakeVault } from "../scanner.test";

const ref = (url: string): MediaRef => ({
  notePath: "x.md", rawMatch: url, rawStart: 0, rawEnd: url.length, url, kind: "md-image",
});

describe("LocalStorageBackend", () => {
  it("put writes to media folder and returns vault path", async () => {
    const vault = new FakeVault([]);
    const b = new LocalStorageBackend(vault, { folder: "media" });
    const url = await b.put(new ArrayBuffer(8), "cat.png");
    expect(url).toBe("media/cat.png");
    expect(await vault.exists("media/cat.png")).toBe(true);
  });
  it("appends -N suffix on collision", async () => {
    const vault = new FakeVault([{ path: "media/cat.png", content: "" }]);
    const b = new LocalStorageBackend(vault, { folder: "media" });
    expect(await b.put(new ArrayBuffer(8), "cat.png")).toBe("media/cat-1.png");
  });
  it("selfProduced matches own folder paths", async () => {
    const b = new LocalStorageBackend(new FakeVault([]), { folder: "media" });
    expect(b.selfProduced("media/cat.png")).toBe(true);
    expect(b.selfProduced("https://example.com/cat.png")).toBe(false);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/storage/local.test.ts`
Expected: FAIL — modules missing.

**Step 3: Write `src/storage/backend.ts`**

```ts
// src/storage/backend.ts

export interface Backend {
  put(buf: ArrayBuffer, name: string): Promise<string>;
  selfProduced(url: string): boolean;
}

export type BackendId = "local" | "webdav" | "s3";

export interface BackendFactory {
  id: BackendId;
  name: string;
  // build(cfg: unknown, deps: BackendDeps): Backend;
}
```

**Step 4: Write `src/storage/local.ts`**

```ts
// src/storage/local.ts
import { Backend } from "./backend";
import { VaultAdapter } from "../vault-adapter";
import { collisionSuffix, joinVaultPath } from "../url";

export interface LocalStorageConfig {
  folder: string; // null handled by caller (resolved to Obsidian attachment folder)
}

export class LocalStorageBackend implements Backend {
  constructor(private vault: VaultAdapter, private cfg: LocalStorageConfig) {}

  async put(buf: ArrayBuffer, name: string): Promise<string> {
    const existing = await this.vault.listDir(this.cfg.folder);
    const final = collisionSuffix(name, new Set(existing));
    const path = joinVaultPath(this.cfg.folder, final);
    await this.vault.writeBinary(path, buf);
    return path;
  }

  selfProduced(url: string): boolean {
    if (!url) return false;
    if (/^(https?:|app:|file:)/i.test(url)) return false;
    // Wikilink-style vault path: matches if it starts with our folder prefix
    return url.startsWith(joinVaultPath(this.cfg.folder, "") + "/") || url === this.cfg.folder;
  }
}
```

**Step 5: Run tests to verify pass**

Run: `npm run test -- src/__tests__/storage/local.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/storage/backend.ts src/storage/local.ts src/__tests__/storage/local.test.ts
git commit -m "feat(storage): add Backend interface and LocalStorageBackend"
```

---

## Task 9: WebDAV backend

Uses injected `Requester` (separate from the HEAD requester — has `put(url, buf, auth)` and `head(url, auth)`). No external dep; we just do HTTP via `requestUrl` in production.

**Files:**
- Create: `src/storage/webdav.ts`
- Test: `src/__tests__/storage/webdav.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/storage/webdav.test.ts
import { describe, it, expect, vi } from "vitest";
import { WebDAVBackend } from "../../storage/webdav";

const makeBackend = (puts: Record<string, ArrayBuffer>) => {
  const putFn = vi.fn(async (url: string, buf: ArrayBuffer) => {
    puts[url] = buf;
    return { ok: true, status: 201 };
  });
  const headFn = vi.fn(async (url: string) => ({ exists: url in puts }));
  return { backend: new WebDAVBackend({ baseURL: "https://dav.example.com/media/", username: "u", password: "p", avoidOverwrite: false }, { put: putFn, head: headFn }), putFn, headFn };
};

describe("WebDAVBackend", () => {
  it("put uploads to baseURL+name and returns public URL", async () => {
    const { backend, putFn } = makeBackend({});
    const url = await backend.put(new ArrayBuffer(4), "cat.png");
    expect(putFn).toHaveBeenCalledWith("https://dav.example.com/media/cat.png", expect.any(ArrayBuffer), { username: "u", password: "p" });
    expect(url).toBe("https://dav.example.com/media/cat.png");
  });
  it("avoidOverwrite appends -N on collision (via HEAD check)", async () => {
    const { backend, headFn } = makeBackend({ "https://dav.example.com/media/cat.png": new ArrayBuffer(0) });
    backend["cfg"].avoidOverwrite = true;
    const url = await backend.put(new ArrayBuffer(4), "cat.png");
    expect(headFn).toHaveBeenCalled();
    expect(url).toBe("https://dav.example.com/media/cat-1.png");
  });
  it("selfProduced matches baseURL prefix", async () => {
    const { backend } = makeBackend({});
    expect(backend.selfProduced("https://dav.example.com/media/cat.png")).toBe(true);
    expect(backend.selfProduced("https://other.com/cat.png")).toBe(false);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/storage/webdav.test.ts`
Expected: FAIL — module missing.

**Step 3: Write `src/storage/webdav.ts`**

```ts
// src/storage/webdav.ts
import { Backend } from "./backend";
import { collisionSuffix } from "../url";

export interface WebDAVConfig {
  baseURL: string;      // e.g. https://dav.example.com/media/  (trailing slash optional)
  username: string;
  password: string;
  avoidOverwrite: boolean;
}

export interface WebDAVRequester {
  put(url: string, buf: ArrayBuffer, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }>;
  head(url: string, auth: { username: string; password: string }): Promise<{ exists: boolean }>;
}

export class WebDAVBackend implements Backend {
  constructor(private cfg: WebDAVConfig, private req: WebDAVRequester) {}

  private base(): string {
    return this.cfg.baseURL.endsWith("/") ? this.cfg.baseURL : this.cfg.baseURL + "/";
  }

  private auth() {
    return { username: this.cfg.username, password: this.cfg.password };
  }

  async put(buf: ArrayBuffer, name: string): Promise<string> {
    let final = name;
    if (this.cfg.avoidOverwrite) {
      const existing = new Set<string>();
      let candidate = name;
      let i = 1;
      while ((await this.req.head(this.base() + candidate, this.auth())).exists) {
        existing.add(candidate);
        candidate = collisionSuffix(name, existing);
      }
      final = candidate;
    }
    const url = this.base() + final;
    await this.req.put(url, buf, this.auth());
    return url;
  }

  selfProduced(url: string): boolean {
    return url.startsWith(this.base());
  }
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/storage/webdav.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/storage/webdav.ts src/__tests__/storage/webdav.test.ts
git commit -m "feat(storage): add WebDAVBackend"
```

---

## Task 10: S3 backend

Uses `minio` client. We wrap it behind a thin `S3Client` interface so unit tests mock the client; production wires the real `minio.Client`.

**Files:**
- Create: `src/storage/s3.ts`
- Test: `src/__tests__/storage/s3.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/storage/s3.test.ts
import { describe, it, expect, vi } from "vitest";
import { S3Backend, S3Config, S3Client } from "../../storage/s3";

const mockClient = (existing: Set<string>): S3Client => ({
  putObject: vi.fn(async (key: string, _buf: ArrayBuffer) => { existing.add(key); }),
  objectExists: vi.fn(async (key: string) => existing.has(key)),
});

const cfg: S3Config = {
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  bucket: "media",
  accessKeyId: "k",
  secretAccessKey: "s",
  keyPrefix: "notes",
  publicUrlTemplate: "https://cdn.example.com/media/{{key}}",
};

describe("S3Backend", () => {
  it("put uploads to bucket/prefix/name and renders publicUrlTemplate", async () => {
    const client = mockClient(new Set());
    const b = new S3Backend(cfg, client);
    const url = await b.put(new ArrayBuffer(4), "cat.png");
    expect(client.putObject).toHaveBeenCalledWith("notes/cat.png", expect.any(ArrayBuffer));
    expect(url).toBe("https://cdn.example.com/media/notes/cat.png");
  });
  it("appends -N suffix on collision via objectExists", async () => {
    const client = mockClient(new Set(["notes/cat.png"]));
    const b = new S3Backend(cfg, client);
    const url = await b.put(new ArrayBuffer(4), "cat.png");
    expect(url).toBe("https://cdn.example.com/media/notes/cat-1.png");
    expect(client.putObject).toHaveBeenCalledWith("notes/cat-1.png", expect.any(ArrayBuffer));
  });
  it("selfProduced matches publicUrlTemplate prefix", async () => {
    const b = new S3Backend(cfg, mockClient(new Set()));
    expect(b.selfProduced("https://cdn.example.com/media/notes/cat.png")).toBe(true);
    expect(b.selfProduced("https://other.com/notes/cat.png")).toBe(false);
  });
  it("falls back to endpoint/bucket/key when publicUrlTemplate is empty", async () => {
    const client = mockClient(new Set());
    const b = new S3Backend({ ...cfg, publicUrlTemplate: "" }, client);
    const url = await b.put(new ArrayBuffer(4), "cat.png");
    expect(url).toBe("https://s3.example.com/media/notes/cat.png");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/storage/s3.test.ts`
Expected: FAIL — module missing.

**Step 3: Write `src/storage/s3.ts`**

```ts
// src/storage/s3.ts
import { Backend } from "./backend";
import { collisionSuffix } from "../url";

export interface S3Config {
  endpoint: string;          // https://s3.example.com
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;         // e.g. "notes" (no leading/trailing slash)
  publicUrlTemplate: string; // e.g. https://cdn.example.com/media/{{key}} — empty = use endpoint/bucket/key
}

export interface S3Client {
  putObject(key: string, buf: ArrayBuffer): Promise<void>;
  objectExists(key: string): Promise<boolean>;
}

export class S3Backend implements Backend {
  constructor(private cfg: S3Config, private client: S3Client) {}

  private prefix(): string {
    return this.cfg.keyPrefix.replace(/^\/+|\/+$/g, "");
  }

  private renderPublicURL(key: string): string {
    if (this.cfg.publicUrlTemplate) {
      return this.cfg.publicUrlTemplate.replace("{{key}}", key);
    }
    const base = this.cfg.endpoint.replace(/\/+$/, "");
    return `${base}/${this.cfg.bucket}/${key}`;
  }

  async put(buf: ArrayBuffer, name: string): Promise<string> {
    const existing = new Set<string>();
    let candidate = name;
    while (await this.client.objectExists(this.fullKey(candidate))) {
      existing.add(candidate);
      candidate = collisionSuffix(name, existing);
    }
    const key = this.fullKey(candidate);
    await this.client.putObject(key, buf);
    return this.renderPublicURL(key);
  }

  private fullKey(name: string): string {
    const p = this.prefix();
    return p ? `${p}/${name}` : name;
  }

  selfProduced(url: string): boolean {
    if (!this.cfg.publicUrlTemplate) {
      return url.startsWith(`${this.cfg.endpoint.replace(/\/+$/, "")}/${this.cfg.bucket}/`);
    }
    const prefix = this.cfg.publicUrlTemplate.split("{{key}}")[0];
    return url.startsWith(prefix);
  }
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/storage/s3.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/storage/s3.ts src/__tests__/storage/s3.test.ts
git commit -m "feat(storage): add S3Backend with template-based public URL"
```

---

## Task 11: Downloader

Wraps the actual `GET` request behind an injectable interface. Honors a timeout. Returns `null` on non-2xx or network error. In dry-run, returns a sentinel without doing the GET.

**Files:**
- Create: `src/downloader.ts`
- Test: `src/__tests__/downloader.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/downloader.test.ts
import { describe, it, expect, vi } from "vitest";
import { Downloader, FetchRequester } from "../downloader";

describe("Downloader", () => {
  it("returns buffer on 2xx", async () => {
    const req: FetchRequester = {
      fetch: vi.fn(async (_url, _opts) => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), contentType: "image/png" })),
    };
    const d = new Downloader(req, { timeoutMs: 5000 });
    const r = await d.fetch("https://x.com/cat.png", { dryRun: false });
    expect(r).not.toBeNull();
    expect(r!.dryRun).toBe(false);
  });
  it("returns null on 404", async () => {
    const req: FetchRequester = { fetch: vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), contentType: "" })) };
    const d = new Downloader(req, { timeoutMs: 5000 });
    expect(await d.fetch("https://x.com/x.png", { dryRun: false })).toBeNull();
  });
  it("dry-run skips fetch and returns sentinel", async () => {
    const req: FetchRequester = { fetch: vi.fn(async () => { throw new Error("should not be called"); }) };
    const d = new Downloader(req, { timeoutMs: 5000 });
    const r = await d.fetch("https://x.com/cat.png", { dryRun: true });
    expect(r).not.toBeNull();
    expect(r!.dryRun).toBe(true);
    expect(req.fetch).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/downloader.test.ts`
Expected: FAIL — module missing.

**Step 3: Write `src/downloader.ts`**

```ts
// src/downloader.ts
import { RunContext } from "./types";

export interface FetchRequester {
  fetch(url: string, opts: { timeoutMs: number }): Promise<{
    ok: boolean;
    status: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    contentType: string;
  }>;
}

export interface DownloaderConfig {
  timeoutMs: number;
}

export interface FetchResult {
  dryRun: boolean;
  buf: ArrayBuffer;
  contentType: string;
}

export class Downloader {
  constructor(private req: FetchRequester, private cfg: DownloaderConfig) {}

  async fetch(url: string, ctx: RunContext): Promise<FetchResult | null> {
    if (ctx.dryRun) {
      return { dryRun: true, buf: new ArrayBuffer(0), contentType: "" };
    }
    try {
      const res = await this.req.fetch(url, { timeoutMs: this.cfg.timeoutMs });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return { dryRun: false, buf, contentType: res.contentType };
    } catch {
      return null;
    }
  }
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/downloader.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/downloader.ts src/__tests__/downloader.test.ts
git commit -m "feat(downloader): add fetch wrapper with dry-run sentinel"
```

---

## Task 12: Progress reporter

Two implementations of the `ProgressReporter` interface — one for live runs (status bar text), one for dry-run (modal accumulation). Both are coupled to Obsidian APIs, so we keep the *interface* pure and inject concrete reporters from `main.ts`. We unit-test the dry-run accumulator (no Obsidian dep) and stub the status bar reporter (no test — it's a 10-line wrapper).

**Files:**
- Create: `src/progress.ts`
- Test: `src/__tests__/progress.test.ts`

**Step 1: Write failing tests for the dry-run accumulator**

```ts
// src/__tests__/progress.test.ts
import { describe, it, expect } from "vitest";
import { DryRunAccumulator } from "../progress";
import { MediaRef } from "../types";

const ref = (url: string): MediaRef => ({
  notePath: "x.md", rawMatch: url, rawStart: 0, rawEnd: url.length, url, kind: "md-image",
});

describe("DryRunAccumulator", () => {
  it("accumulates would-download, would-rewrite, dropped, failed", () => {
    const acc = new DryRunAccumulator();
    acc.start(3);
    acc.reportWouldDownload(ref("https://x.com/a.png"), "media/a.png", "x.md");
    acc.reportWouldDownload(ref("https://x.com/b.png"), "media/b.png", "x.md");
    acc.reportDropped(ref("https://bad.com/c.png"), "denylist");
    acc.reportFailed(ref("https://x.com/d.png"), "timeout");
    acc.finish({ scannedNotes: 1, candidates: 4, downloaded: 2, rewritten: 2, dropped: [], failed: [], dryRun: true });
    const r = acc.getReport();
    expect(r.wouldDownload).toHaveLength(2);
    expect(r.wouldRewrite).toHaveLength(2);
    expect(r.dropped).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/progress.test.ts`
Expected: FAIL — module missing.

**Step 3: Write `src/progress.ts`**

```ts
// src/progress.ts
import { Dropped, Failed, MediaRef, RunReport } from "./types";

export interface ProgressReporter {
  start(total: number): void;
  update(done: number, current: string): void;
  reportDropped(ref: MediaRef, reason: Dropped["reason"]): void;
  reportFailed(ref: MediaRef, error: string): void;
  reportWouldDownload(ref: MediaRef, dest: string, notePath: string): void;
  reportWouldRewrite(notePath: string, ref: MediaRef, newUrl: string): void;
  reportDownloaded(ref: MediaRef, dest: string): void;
  reportRewritten(notePath: string, ref: MediaRef, newUrl: string): void;
  finish(report: RunReport): void;
}

export interface WouldDownload { ref: MediaRef; dest: string; notePath: string; }
export interface WouldRewrite { notePath: string; ref: MediaRef; newUrl: string; }

export class DryRunAccumulator implements ProgressReporter {
  wouldDownload: WouldDownload[] = [];
  wouldRewrite: WouldRewrite[] = [];
  dropped: Dropped[] = [];
  failed: Failed[] = [];

  start(_total: number) {}
  update(_done: number, _current: string) {}
  reportDropped(ref: MediaRef, reason: Dropped["reason"]) { this.dropped.push({ ref, reason }); }
  reportFailed(ref: MediaRef, error: string) { this.failed.push({ ref, error }); }
  reportWouldDownload(ref: MediaRef, dest: string, notePath: string) {
    this.wouldDownload.push({ ref, dest, notePath });
  }
  reportWouldRewrite(notePath: string, ref: MediaRef, newUrl: string) {
    this.wouldRewrite.push({ notePath, ref, newUrl });
  }
  reportDownloaded(_ref: MediaRef, _dest: string) {}
  reportRewritten(_notePath: string, _ref: MediaRef, _newUrl: string) {}
  finish(_report: RunReport) {}

  getReport() {
    return { wouldDownload: this.wouldDownload, wouldRewrite: this.wouldRewrite, dropped: this.dropped, failed: this.failed };
  }
}

// No-op reporter for tests that don't care about progress.
export class NullProgressReporter implements ProgressReporter {
  start(_total: number) {}
  update(_done: number, _current: string) {}
  reportDropped(_ref: MediaRef, _reason: Dropped["reason"]) {}
  reportFailed(_ref: MediaRef, _error: string) {}
  reportWouldDownload(_ref: MediaRef, _dest: string, _notePath: string) {}
  reportWouldRewrite(_notePath: string, _ref: MediaRef, _newUrl: string) {}
  reportDownloaded(_ref: MediaRef, _dest: string) {}
  reportRewritten(_notePath: string, _ref: MediaRef, _newUrl: string) {}
  finish(_report: RunReport) {}
}
```

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/__tests__/progress.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/progress.ts src/__tests__/progress.test.ts
git commit -m "feat(progress): add ProgressReporter interface and DryRunAccumulator"
```

---

## Task 13: Importer orchestrator

The pipeline. Takes settings, deps (`VaultAdapter`, `FetchRequester`, `HeadRequester`, `Backend`), and a `ProgressReporter`. Runs scan → filter → size filter → download → store → rewrite. Produces a `RunReport`.

**Files:**
- Create: `src/importer.ts`
- Test: `src/__tests__/importer.test.ts`

**Step 1: Write failing tests**

```ts
// src/__tests__/importer.test.ts
import { describe, it, expect, vi } from "vitest";
import { runImport, ImporterDeps } from "../importer";
import { MediaImporterSettings } from "../settings";
import { Backend } from "../storage/backend";
import { DryRunAccumulator } from "../progress";
import { VaultAdapter } from "../vault-adapter";
import { FakeVault } from "./scanner.test";

const baseSettings: MediaImporterSettings = {
  scanPaths: [],
  detectors: { mdImage: true, mdAv: true, wikilink: false, htmlImg: false, htmlAv: false },
  allowlist: ["*"],
  denylist: [],
  sizeLimitMB: null,
  activeBackend: "local",
  local: { folder: "media" },
  webdav: { baseURL: "", username: "", password: "", avoidOverwrite: false },
  s3: { endpoint: "", region: "", bucket: "", accessKeyId: "", secretAccessKey: "", keyPrefix: "", publicUrlTemplate: "" },
  requestTimeoutSec: 30,
};

const fakeBackend = (selfProducedPrefix = "media/"): Backend => ({
  put: vi.fn(async (_buf: ArrayBuffer, name: string) => `${selfProducedPrefix}${name}`),
  selfProduced: (url: string) => url.startsWith(selfProducedPrefix),
});

const fakeDeps = (vault: VaultAdapter, backend: Backend): ImporterDeps => ({
  vault,
  backend,
  fetch: vi.fn(async (_url: string, _opts) => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), contentType: "image/png" })),
  head: vi.fn(async (_url: string) => ({ contentLength: 100 })),
});

describe("runImport — live run", () => {
  it("downloads and rewrites a single image", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![cat](https://x.com/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.downloaded).toBe(1);
    expect(report.rewritten).toBe(1);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(backend.put).toHaveBeenCalledTimes(1);
    // Vault content was modified via vault.modifyText
  });
  it("skips URLs the backend says it produced", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![cat](media/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.candidates).toBe(0);
    expect(report.downloaded).toBe(0);
  });
  it("leaves note untouched when any ref in it fails to fetch (atomicity)", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![a](https://x.com/a.png)\n![b](https://x.com/b.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    deps.fetch = vi.fn(async (url: string) => url.includes("b") ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), contentType: "" } : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), contentType: "image/png" });
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.failed).toHaveLength(1);
    expect(report.rewritten).toBe(0);
  });
});

describe("runImport — dry run", () => {
  it("does not fetch, store, or modify; reports would-download/rewrite", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![cat](https://x.com/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const acc = new DryRunAccumulator();
    const report = await runImport(deps, baseSettings, { dryRun: true }, acc);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(backend.put).not.toHaveBeenCalled();
    expect(report.downloaded).toBe(0);
    expect(acc.wouldDownload).toHaveLength(1);
    expect(acc.wouldRewrite).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/__tests__/importer.test.ts`
Expected: FAIL — `runImport` and `MediaImporterSettings` missing.

**Step 3: Create `src/settings.ts` (settings types only — UI comes later)**

```ts
// src/settings.ts

export type BackendId = "local" | "webdav" | "s3";

export interface MediaImporterSettings {
  scanPaths: string[];
  detectors: {
    mdImage: boolean;
    mdAv: boolean;
    wikilink: boolean;
    htmlImg: boolean;
    htmlAv: boolean;
  };
  allowlist: string[];
  denylist: string[];
  sizeLimitMB: number | null;
  activeBackend: BackendId;
  local: { folder: string | null };
  webdav: { baseURL: string; username: string; password: string; avoidOverwrite: boolean };
  s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; keyPrefix: string; publicUrlTemplate: string };
  requestTimeoutSec: number;
}

export const DEFAULT_SETTINGS: MediaImporterSettings = {
  scanPaths: [],
  detectors: { mdImage: true, mdAv: true, wikilink: false, htmlImg: false, htmlAv: false },
  allowlist: ["*"],
  denylist: [],
  sizeLimitMB: null,
  activeBackend: "local",
  local: { folder: null },
  webdav: { baseURL: "", username: "", password: "", avoidOverwrite: false },
  s3: { endpoint: "", region: "", bucket: "", accessKeyId: "", secretAccessKey: "", keyPrefix: "", publicUrlTemplate: "" },
  requestTimeoutSec: 30,
};
```

**Step 4: Write `src/importer.ts`**

```ts
// src/importer.ts
import { MediaImporterSettings } from "./settings";
import { Backend } from "./storage/backend";
import { VaultAdapter } from "./vault-adapter";
import { FetchRequester } from "./downloader";
import { HeadRequester } from "./filter";
import { walkVault, ScannerConfig } from "./scanner";
import { filterByRules, filterBySize } from "./filter";
import { Downloader } from "./downloader";
import { rewriteNote } from "./rewriter";
import { ProgressReporter, NullProgressReporter } from "./progress";
import { urlBasename } from "./url";
import { MediaRef, RunReport, RunContext, Dropped, Failed } from "./types";

export interface ImporterDeps {
  vault: VaultAdapter;
  backend: Backend;
  fetch: FetchRequester;
  head: HeadRequester;
}

export async function runImport(
  deps: ImporterDeps,
  settings: MediaImporterSettings,
  ctx: RunContext,
  progress: ProgressReporter = new NullProgressReporter(),
): Promise<RunReport> {
  const scannerCfg: ScannerConfig = { ...settings.detectors };
  const refs = await walkVault(deps.vault, settings.scanPaths, scannerCfg);

  const scannedNotes = new Set(refs.map(r => r.notePath)).size;

  // Drop URLs the active backend says it already produced.
  const fresh: MediaRef[] = [];
  const alreadyProduced: Dropped[] = [];
  for (const r of refs) {
    if (deps.backend.selfProduced(r.url)) {
      alreadyProduced.push({ ref: r, reason: "already-local" });
      progress.reportDropped(r, "already-local");
    } else {
      fresh.push(r);
    }
  }

  const ruleFiltered = filterByRules(fresh, { allowlist: settings.allowlist, denylist: settings.denylist });
  for (const d of ruleFiltered.dropped) progress.reportDropped(d.ref, d.reason);

  const sizeFiltered = await filterBySize(ruleFiltered.kept, settings.sizeLimitMB, deps.head);
  for (const d of sizeFiltered.dropped) progress.reportDropped(d.ref, "too-large");

  const candidates = sizeFiltered.kept;

  progress.start(candidates.length);

  const downloader = new Downloader(deps.fetch, { timeoutMs: settings.requestTimeoutSec * 1000 });

  // Group refs by note so we can rewrite atomically.
  const byNote = new Map<string, MediaRef[]>();
  for (const r of candidates) {
    const arr = byNote.get(r.notePath) ?? [];
    arr.push(r);
    byNote.set(r.notePath, arr);
  }

  const downloaded: MediaRef[] = [];
  const failed: Failed[] = [];
  let done = 0;

  for (const [notePath, noteRefs] of byNote) {
    const rewrites: { ref: MediaRef; newUrl: string }[] = [];
    let noteFailed = false;
    for (const ref of noteRefs) {
      progress.update(done, ref.url);
      const result = await downloader.fetch(ref.url, ctx);
      if (result === null) {
        failed.push({ ref, error: "fetch failed" });
        progress.reportFailed(ref, "fetch failed");
        noteFailed = true;
        done++;
        continue;
      }
      const name = urlBasename(ref.url);
      let dest: string;
      if (ctx.dryRun) {
        // Ask backend where it WOULD put without writing. We compute the candidate
        // path/URL by calling a helper; for simplicity reuse put() when not dryRun
        // and synthesize in dry-run by mimicking backend logic.
        dest = await synthDest(deps.backend, name);
        progress.reportWouldDownload(ref, dest, notePath);
      } else {
        dest = await deps.backend.put(result.buf, name);
        progress.reportDownloaded(ref, dest);
      }
      rewrites.push({ ref, newUrl: dest });
      downloaded.push(ref);
      done++;
    }
    if (!noteFailed && rewrites.length > 0) {
      if (ctx.dryRun) {
        for (const rw of rewrites) progress.reportWouldRewrite(notePath, rw.ref, rw.newUrl);
      } else {
        const original = await deps.vault.read(notePath);
        const updated = rewriteNote(original, rewrites);
        await deps.vault.modifyText(notePath, updated);
        for (const rw of rewrites) progress.reportRewritten(notePath, rw.ref, rw.newUrl);
      }
    }
  }

  const report: RunReport = {
    scannedNotes,
    candidates: fresh.length,
    downloaded: ctx.dryRun ? 0 : downloaded.length,
    rewritten: ctx.dryRun ? 0 : downloaded.length, // approx: refined later
    dropped: [...alreadyProduced, ...ruleFiltered.dropped, ...sizeFiltered.dropped],
    failed,
    dryRun: ctx.dryRun,
  };
  progress.finish(report);
  return report;
}

// Dry-run needs to know where backend WOULD store, without actually storing.
// We synthesize by calling a separate method; for v1 we use a simple convention:
// the backend exposes a `dryRunDest(name)` if available, else fall back to `put()`
// (which would write — so we don't call it). For v1 we keep it simple and require
// backends to expose `dryRunDest`.
async function synthDest(backend: Backend & { dryRunDest?(name: string): Promise<string> }, name: string): Promise<string> {
  if (backend.dryRunDest) return backend.dryRunDest(name);
  throw new Error("backend does not support dryRunDest");
}
```

Note: We need to add `dryRunDest` to each backend. Update Task 8/9/10 follow-up.

**Step 5: Run tests to verify failure (will fail — backends missing `dryRunDest`)**

Run: `npm run test -- src/__tests__/importer.test.ts`
Expected: FAIL — synthDest throws.

**Step 6: Add `dryRunDest` to each backend**

Modify `src/storage/local.ts`:

```ts
async dryRunDest(name: string): Promise<string> {
  const existing = await this.vault.listDir(this.cfg.folder);
  const final = collisionSuffix(name, new Set(existing));
  return joinVaultPath(this.cfg.folder, final);
}
```

Modify `src/storage/webdav.ts`:

```ts
async dryRunDest(name: string): Promise<string> {
  if (!this.cfg.avoidOverwrite) return this.base() + name;
  const existing = new Set<string>();
  let candidate = name;
  let i = 1;
  while ((await this.req.head(this.base() + candidate, this.auth())).exists) {
    existing.add(candidate);
    candidate = collisionSuffix(name, existing);
  }
  return this.base() + candidate;
}
```

Modify `src/storage/s3.ts`:

```ts
async dryRunDest(name: string): Promise<string> {
  const existing = new Set<string>();
  let candidate = name;
  while (await this.client.objectExists(this.fullKey(candidate))) {
    existing.add(candidate);
    candidate = collisionSuffix(name, existing);
  }
  return this.renderPublicURL(this.fullKey(candidate));
}
```

**Step 7: Run tests to verify pass**

Run: `npm run test -- src/__tests__/importer.test.ts`
Expected: PASS.

**Step 8: Commit**

```bash
git add src/importer.ts src/settings.ts src/storage/local.ts src/storage/webdav.ts src/storage/s3.ts src/__tests__/importer.test.ts
git commit -m "feat(importer): add orchestrator with dry-run and atomic per-note rewrite"
```

---

## Task 14: Settings tab UI

Render the settings panel using Obsidian's `Setting` class. Coupled to `obsidian` — not unit-tested.

**Files:**
- Create: `src/settings-tab.ts`

**Step 1: Write `src/settings-tab.ts`**

```ts
// src/settings-tab.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import { MediaImporterPlugin } from "./main";
import { MediaImporterSettings } from "./settings";

export class MediaImporterSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MediaImporterPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    // ---- Scanning ----
    new Setting(containerEl).setName("Scanning").setHeading();
    new Setting(containerEl)
      .setName("Scan paths")
      .setDesc("Comma-separated folder paths to scan. Empty = whole vault.")
      .addText((t) =>
        t.setValue(s.scanPaths.join(", ")).onChange(async (v) => {
          s.scanPaths = v.split(",").map((p) => p.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Detectors").setHeading();
    const toggles: [keyof MediaImporterSettings["detectors"], string][] = [
      ["mdImage", "Markdown ![]() (images)"],
      ["mdAv", "Markdown ![]() (audio/video)"],
      ["wikilink", "Wikilink ![[url]]"],
      ["htmlImg", "HTML <img>"],
      ["htmlAv", "HTML <video>/<audio>/<source>"],
    ];
    for (const [key, name] of toggles) {
      new Setting(containerEl)
        .setName(name)
        .addToggle((t) => t.setValue(s.detectors[key]).onChange(async (v) => {
          s.detectors[key] = v;
          await this.plugin.saveSettings();
        }));
    }

    // ---- Filters ----
    new Setting(containerEl).setName("Filters").setHeading();
    new Setting(containerEl)
      .setName("Allowlist")
      .setDesc("Comma-separated hosts. * = all (default).")
      .addText((t) => t.setValue(s.allowlist.join(", ")).onChange(async (v) => {
        s.allowlist = v.split(",").map((p) => p.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("Denylist")
      .setDesc("Comma-separated hosts to skip. Empty by default.")
      .addText((t) => t.setValue(s.denylist.join(", ")).onChange(async (v) => {
        s.denylist = v.split(",").map((p) => p.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("Size limit (MB)")
      .setDesc("Skip files larger than this. 0 = off.")
      .addText((t) => t.setValue(s.sizeLimitMB ? String(s.sizeLimitMB) : "0").onChange(async (v) => {
        const n = Number(v);
        s.sizeLimitMB = n > 0 ? n : null;
        await this.plugin.saveSettings();
      }));

    // ---- Backend ----
    new Setting(containerEl).setName("Backend").setHeading();
    new Setting(containerEl)
      .setName("Active backend")
      .addDropdown((d) => {
        d.addOption("local", "Local vault")
          .addOption("webdav", "WebDAV")
          .addOption("s3", "S3-compatible")
          .setValue(s.activeBackend)
          .onChange(async (v) => {
            s.activeBackend = v as MediaImporterSettings["activeBackend"];
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (s.activeBackend === "local") {
      new Setting(containerEl)
        .setName("Local folder")
        .setDesc("Vault folder for stored media. Empty = Obsidian attachment folder.")
        .addText((t) => t.setValue(s.local.folder ?? "").onChange(async (v) => {
          s.local.folder = v.trim() || null;
          await this.plugin.saveSettings();
        }));
    } else if (s.activeBackend === "webdav") {
      new Setting(containerEl).setName("WebDAV base URL").addText((t) => t.setValue(s.webdav.baseURL).onChange(async (v) => { s.webdav.baseURL = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Username").addText((t) => t.setValue(s.webdav.username).onChange(async (v) => { s.webdav.username = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Password").addText((t) => { t.inputEl.type = "password"; t.setValue(s.webdav.password).onChange(async (v) => { s.webdav.password = v; await this.plugin.saveSettings(); }); });
      new Setting(containerEl).setName("Avoid overwrite").addToggle((t) => t.setValue(s.webdav.avoidOverwrite).onChange(async (v) => { s.webdav.avoidOverwrite = v; await this.plugin.saveSettings(); }));
    } else if (s.activeBackend === "s3") {
      new Setting(containerEl).setName("Endpoint").addText((t) => t.setValue(s.s3.endpoint).onChange(async (v) => { s.s3.endpoint = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Region").addText((t) => t.setValue(s.s3.region).onChange(async (v) => { s.s3.region = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Bucket").addText((t) => t.setValue(s.s3.bucket).onChange(async (v) => { s.s3.bucket = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Access key ID").addText((t) => t.setValue(s.s3.accessKeyId).onChange(async (v) => { s.s3.accessKeyId = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Secret access key").addText((t) => { t.inputEl.type = "password"; t.setValue(s.s3.secretAccessKey).onChange(async (v) => { s.s3.secretAccessKey = v; await this.plugin.saveSettings(); }); });
      new Setting(containerEl).setName("Key prefix").addText((t) => t.setValue(s.s3.keyPrefix).onChange(async (v) => { s.s3.keyPrefix = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Public URL template").setDesc("Use {{key}} as placeholder. Empty = <endpoint>/<bucket>/<key>.").addText((t) => t.setValue(s.s3.publicUrlTemplate).onChange(async (v) => { s.s3.publicUrlTemplate = v; await this.plugin.saveSettings(); }));
    }

    // ---- Advanced ----
    new Setting(containerEl).setName("Advanced").setHeading();
    new Setting(containerEl)
      .setName("Request timeout (seconds)")
      .addText((t) => t.setValue(String(s.requestTimeoutSec)).onChange(async (v) => {
        s.requestTimeoutSec = Number(v) || 30;
        await this.plugin.saveSettings();
      }));
  }
}
```

**Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: FAIL — `MediaImporterPlugin` not yet defined (Task 15). That's expected; we'll typecheck again after Task 15.

**Step 3: Commit (UI is coupled to Obsidian; we trust the typecheck after Task 15)**

```bash
git add src/settings-tab.ts
git commit -m "feat(settings): add Obsidian settings tab UI"
```

---

## Task 15: main.ts — plugin entry, command registration, wiring

Wire everything: load settings, instantiate backend from settings, register two commands (`import` and `import-dry-run`), wire `requestUrl`-based `FetchRequester`/`HeadRequester`, wrap `app.vault` in a `VaultAdapter`, show status bar / modal progress.

**Files:**
- Modify: `src/main.ts`
- Create: `src/obsidian-deps.ts` (the production `VaultAdapter` + `FetchRequester` + `HeadRequester` + `WebDAVRequester` + `S3Client` implementations)

**Step 1: Write `src/obsidian-deps.ts`**

```ts
// src/obsidian-deps.ts
import { App, Vault, TFile, requestUrl, RequestUrlParam } from "obsidian";
import { VaultAdapter } from "./vault-adapter";
import { FetchRequester } from "./downloader";
import { HeadRequester } from "./filter";
import { WebDAVRequester } from "./storage/webdav";
import { S3Client } from "./storage/s3";
import { Client as MinioClient } from "minio";

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private vault: Vault, private attachmentFolderResolver: () => string) {}

  async listMarkdownFiles(scanPaths: string[]): Promise<string[]> {
    const all = this.vault.getMarkdownFiles();
    if (scanPaths.length === 0) return all.map(f => f.path);
    const normalized = scanPaths.map(p => p.replace(/\/+$/, ""));
    return all
      .filter(f => normalized.some(p => f.path === p || f.path.startsWith(p + "/")))
      .map(f => f.path);
  }

  async read(path: string): Promise<string> {
    const f = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (!f) throw new Error(`file not found: ${path}`);
    return await this.vault.read(f);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (existing) await this.vault.modifyBinary(existing, data);
    else await this.vault.createBinary(path, data);
  }

  async exists(path: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(path) !== null;
  }

  async listDir(path: string): Promise<string[]> {
    try {
      const result = await this.vault.adapter.list(path);
      return result.files.map(f => f.split("/").pop()!).concat(result.folders.map(f => f.split("/").pop()!));
    } catch {
      return [];
    }
  }

  async modifyText(path: string, content: string): Promise<void> {
    const f = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (!f) throw new Error(`file not found: ${path}`);
    await this.vault.modify(f, content);
  }
}

export class ObsidianFetchRequester implements FetchRequester, HeadRequester, WebDAVRequester {
  async fetch(url: string, opts: { timeoutMs: number }) {
    const params: RequestUrlParam = { url, method: "GET", timeout: opts.timeoutMs };
    try {
      const res = await requestUrl(params);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, arrayBuffer: async () => res.arrayBuffer, contentType: res.headers["content-type"] ?? "" };
    } catch (e: any) {
      return { ok: false, status: e?.status ?? 0, arrayBuffer: async () => new ArrayBuffer(0), contentType: "" };
    }
  }

  async head(url: string) {
    try {
      const res = await requestUrl({ url, method: "HEAD" });
      const len = Number(res.headers["content-length"] ?? "");
      return { contentLength: Number.isFinite(len) ? len : null };
    } catch {
      return { contentLength: null };
    }
  }

  async put(url: string, buf: ArrayBuffer, auth: { username: string; password: string }) {
    try {
      const res = await requestUrl({ url, method: "PUT", body: buf, headers: { Authorization: "Basic " + base64(`${auth.username}:${auth.password}`) } });
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (e: any) {
      return { ok: false, status: e?.status ?? 0 };
    }
  }
}

function base64(s: string): string {
  return btoa(s);
}

export class MinioS3Client implements S3Client {
  private client: MinioClient;
  constructor(cfg: { endPoint: string; region: string; accessKey: string; secretKey: string; useSSL?: boolean }) {
    this.client = new MinioClient({
      endPoint: cfg.endPoint.replace(/^https?:\/\//, ""),
      region: cfg.region,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
      useSSL: cfg.useSSL ?? cfg.endPoint.startsWith("https"),
    });
  }
  async putObject(key: string, buf: ArrayBuffer): Promise<void> {
    // Minio's putObject wants a stream or buffer; we pass Buffer.from(buf).
    // Need bucket at construction; method signature here lacks bucket — fix in caller.
    throw new Error("putObject must be wired with bucket in caller");
  }
  async objectExists(key: string): Promise<boolean> {
    throw new Error("objectExists must be wired with bucket in caller");
  }
}
```

Hmm — `S3Client.putObject(key, buf)` doesn't take the bucket; we need the minio client bound to a bucket. Let me fix: the `MinioS3Client` constructor should take the bucket and bind it. Update:

```ts
export class MinioS3Client implements S3Client {
  private client: MinioClient;
  constructor(
    cfg: { endPoint: string; region: string; accessKey: string; secretKey: string; useSSL?: boolean },
    private bucket: string,
  ) {
    this.client = new MinioClient({
      endPoint: cfg.endPoint.replace(/^https?:\/\//, ""),
      region: cfg.region,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
      useSSL: cfg.useSSL ?? cfg.endPoint.startsWith("https"),
    });
  }
  async putObject(key: string, buf: ArrayBuffer): Promise<void> {
    await this.client.putObject(this.bucket, key, Buffer.from(buf));
  }
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 2: Replace `src/main.ts`**

```ts
// src/main.ts
import { Plugin, addIcon, Notice, Modal, App, PluginSettingTab } from "obsidian";
import { MediaImporterSettings, DEFAULT_SETTINGS } from "./settings";
import { MediaImporterSettingTab } from "./settings-tab";
import { runImport, ImporterDeps } from "./importer";
import { Backend } from "./storage/backend";
import { LocalStorageBackend } from "./storage/local";
import { WebDAVBackend } from "./storage/webdav";
import { S3Backend } from "./storage/s3";
import {
  ObsidianVaultAdapter,
  ObsidianFetchRequester,
  MinioS3Client,
} from "./obsidian-deps";
import { DryRunAccumulator } from "./progress";
import { urlBasename } from "./url";

export default class MediaImporterPlugin extends Plugin {
  settings!: MediaImporterSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MediaImporterSettingTab(this.app, this));

    this.addCommand({
      id: "import-remote-media",
      name: "Import remote media",
      callback: () => this.run(false),
    });

    this.addCommand({
      id: "import-remote-media-dry-run",
      name: "Import remote media (dry run)",
      callback: () => this.run(true),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async run(dryRun: boolean) {
    const vault = new ObsidianVaultAdapter(this.app.vault, () => this.app.vault.getConfig("attachmentFolderPath") ?? "");
    const fetch = new ObsidianFetchRequester();
    const backend = this.buildBackend(vault, fetch);

    const deps: ImporterDeps = {
      vault,
      backend,
      fetch,
      head: fetch, // ObsidianFetchRequester implements both
    };

    let notice: Notice | null = null;
    let lastUpdate = 0;
    const progress = dryRun
      ? new DryRunAccumulator()
      : {
          start(_t: number) { notice = new Notice("Media import: starting…", 0); },
          update(done: number, current: string) {
            const now = Date.now();
            if (now - lastUpdate < 100) return;
            lastUpdate = now;
            notice?.setMessage(`Media import: ${done} — ${urlBasename(current)}`);
          },
          reportDropped() {},
          reportFailed() {},
          reportWouldDownload() {},
          reportWouldRewrite() {},
          reportDownloaded() {},
          reportRewritten() {},
          finish(r: any) {
            notice?.setMessage(`Media import: done — ${r.downloaded} downloaded, ${r.dropped.length} dropped, ${r.failed.length} failed`);
            setTimeout(() => notice?.hide(), 5000);
          },
        };

    try {
      const report = await runImport(deps, this.settings, { dryRun }, progress as any);
      if (dryRun) this.showDryRunModal(progress as DryRunAccumulator);
      else new Notice(`Imported ${report.downloaded} media (${report.failed.length} failed)`);
    } catch (e: any) {
      new Notice(`Media import failed: ${e?.message ?? e}`);
    }
  }

  private buildBackend(vault: ObsidianVaultAdapter, _fetch: ObsidianFetchRequester): Backend {
    const s = this.settings;
    switch (s.activeBackend) {
      case "local": {
        const folder = s.local.folder ?? this.app.vault.getConfig("attachmentFolderPath") ?? "";
        return new LocalStorageBackend(vault, { folder });
      }
      case "webdav":
        return new WebDAVBackend({ ...s.webdav }, _fetch);
      case "s3": {
        const client = new MinioS3Client(
          {
            endPoint: s.s3.endpoint,
            region: s.s3.region,
            accessKey: s.s3.accessKeyId,
            secretKey: s.s3.secretAccessKey,
          },
          s.s3.bucket,
        );
        return new S3Backend({ ...s.s3 }, client);
      }
    }
  }

  private showDryRunModal(acc: DryRunAccumulator) {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Media import — dry run preview");
    const body = modal.contentEl.createEl("div");
    const section = (title: string, count: number) => {
      const h = body.createEl("h3");
      h.setText(`${title} (${count})`);
    };
    section("Would download", acc.wouldDownload.length);
    for (const w of acc.wouldDownload) body.createEl("div").setText(`${w.notePath} → ${w.dest}  (${w.ref.url})`);
    section("Would rewrite", acc.wouldRewrite.length);
    for (const w of acc.wouldRewrite) body.createEl("div").setText(`${w.notePath}: ${w.ref.url} → ${w.newUrl}`);
    section("Dropped", acc.dropped.length);
    for (const d of acc.dropped) body.createEl("div").setText(`${d.ref.url} — ${d.reason}`);
    section("Failed", acc.failed.length);
    for (const f of acc.failed) body.createEl("div").setText(`${f.ref.url} — ${f.error}`);
    modal.open();
  }
}
```

**Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: PASS for all. If `minio` types complain, install `@types/minio` (minio ships its own types — should be fine). If `btoa` is missing in Node, replace with `Buffer.from(s, "binary").toString("base64")`.

**Step 4: Commit**

```bash
git add src/main.ts src/obsidian-deps.ts
git commit -m "feat(main): wire plugin lifecycle, commands, backends, and progress"
```

---

## Task 16: README expansion

Replace the 2-line README with a real one describing what the plugin does, install steps, the two commands, settings, and the three backends. No code changes.

**Files:**
- Modify: `README.md`

**Step 1: Write README**

```markdown
# Media Importer

An [Obsidian](https://obsidian.md) plugin that downloads remote media referenced in your notes and stores it locally in your vault — or uploads it to a remote backend (WebDAV or any S3-compatible service).

## Features

- **Scans** your notes for external media URLs in:
  - Markdown image embeds: `![alt](https://example.com/cat.png)`
  - Markdown audio/video embeds: `![](https://example.com/clip.mp4)`
  - Wikilink embeds: `![[https://example.com/cat.png]]` (opt-in)
  - HTML `<img>`, `<video>`, `<audio>`, `<source>` tags (opt-in)
- **Downloads** each media file and **rewrites** the note to point at the new location.
- **Three storage backends:**
  - **Local vault** — saves to your configured attachment folder (default).
  - **WebDAV** — uploads to a WebDAV server, rewrites URL to the public address.
  - **S3-compatible** — uploads to any S3 endpoint (AWS, MinIO, Backblaze B2, Cloudflare R2, …), rewrites to a templated public URL.
- **Idempotent**: re-runs skip URLs the plugin already produced (the note's content is the source of truth — no external cache).
- **Dry-run mode**: preview every change before any note is touched or any file is uploaded.
- **Filtering**: allowlist + denylist by host, optional size limit (MB).
- **Collision-safe**: downloaded files get a `-1`, `-2`, … suffix if a file with the same name already exists.

## Commands

- `Import remote media` — scan, download, rewrite.
- `Import remote media (dry run)` — scan and show what *would* happen; nothing is modified or uploaded.

## Settings

| Section | Option | Description |
|---|---|---|
| Scanning | Scan paths | Comma-separated folders. Empty = whole vault. |
| Detectors | per-syntax toggles | Each embed syntax can be enabled/disabled individually. Default: Markdown image + audio/video. |
| Filters | Allowlist / Denylist | Host patterns. `*` = all. Supports regex like `/^i\.imgur\.com$/`. |
| Filters | Size limit (MB) | 0 = off. Skips files larger than this (checked via HEAD). |
| Backend | Active backend | `local`, `webdav`, or `s3`. |
| Backend | per-backend fields | Folder (local), URL/credentials (WebDAV), endpoint/bucket/keys/template (S3). |
| Advanced | Request timeout (seconds) | Per-request timeout. Default 30. |

## Installation

### From release

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Place them in `<vault>/.obsidian/plugins/media-importer/`.
3. Enable the plugin in Obsidian's settings under **Community plugins**.

### From source

```bash
git clone https://github.com/your-name/media-importer
cd media-importer
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and (if present) `styles.css` into your vault's `.obsidian/plugins/media-importer/` directory and enable the plugin.

## Development

```bash
npm run dev       # esbuild watch
npm run test      # vitest run
npm run lint      # eslint
npm run typecheck # tsc --noEmit
```

## License

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: expand README with features, commands, settings, install"
```

---

## Task 17: Final verification

**Step 1: Clean run of all checks**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all green; `main.js` produced; no type errors; no lint errors; all tests pass.

**Step 2: Inspect built bundle size**

Run: `ls -lh main.js`
Expected: a few hundred KB at most (minio is the bulk of it; if it's over ~1.5MB, consider switching S3 implementation to a hand-rolled signer — out of scope for v1).

**Step 3: Inspect git log**

Run: `git log --oneline`
Expected: ~17 commits, one per task, with clear `feat:`/`chore:`/`docs:` prefixes.

**Step 4: No commit** — verification only.

---

## Notes for the implementing engineer

- **Obsidian API:** `requestUrl` returns an object with `arrayBuffer` (already an `ArrayBuffer`, not a function in recent versions — verify against `obsidian.d.ts` shipped in the devcontainer; if `arrayBuffer` is a property, change `arrayBuffer: async () => res.arrayBuffer` to `arrayBuffer: async () => res.arrayBuffer` works either way because calling a non-function returns the value when wrapped). Inspect the type definitions before assuming.
- **`minio` in the browser/sandbox:** Obsidian plugins run in Electron with Node access, so `minio` should work. If it fails to bundle, switch to a minimal hand-rolled AWS Signature v4 signer (~150 LOC) — out of scope for v1.
- **Tests do NOT import `obsidian`.** If you find yourself writing `import { ... } from "obsidian"` in a test file, stop — that file belongs in `main.ts`/`obsidian-deps.ts`/`settings-tab.ts`, all of which are exercised manually via the running plugin, not via unit tests. The pure pipeline (Tasks 1–13) is fully unit-tested.
- **Commit after every task.** Each task ends with a green test run + commit. Do not batch tasks into one commit.
- **Run the lint + typecheck + test + build commands after Task 15 and Task 17.** These are the verification gates.
- **`ag:AGENTS.md`** describes the devcontainer. Node + TypeScript features are preinstalled; `npm install` should "just work".