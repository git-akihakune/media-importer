# Media Importer

<p align="center">
An <a href="https://obsidian.md">Obsidian</a> plugin that downloads remote media referenced in your notes and stores it locally in your vault — or uploads it to a remote backend (WebDAV or any S3-compatible service).
</p>

<p align="center">
<a href="#features">Features</a> ·
<a href="#commands">Commands</a> ·
<a href="#settings">Settings</a> ·
<a href="#installation">Installation</a> ·
<a href="#development">Development</a>
</p>

---

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
- **Idempotent** — re-runs skip URLs the plugin already produced. The note's content is the source of truth; no external cache.
- **Dry-run mode** — preview every change before any note is touched or any file is uploaded.
- **Filtering** — allowlist + denylist by host, optional size limit (MB).
- **Collision-safe** — downloaded files get a `-1`, `-2`, … suffix if a file with the same name already exists.

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

1. Download `main.js` and `manifest.json` from the latest release.
2. Place them in `<vault>/.obsidian/plugins/media-importer/`.
3. Enable the plugin in Obsidian's settings under **Community plugins**.

### From source

```bash
git clone https://github.com/git-akihakune/media-importer
cd media-importer
npm install
npm run build
```

Copy `build/main.js`, `build/manifest.json`, and `build/styles.css` into your vault's `.obsidian/plugins/media-importer/` directory and enable the plugin.

## Development

```bash
npm run dev       # esbuild watch
npm run test      # vitest run
npm run lint      # eslint
npm run typecheck # tsc --noEmit
```

## Releasing

Releases are automated via the [Release workflow](.github/workflows/release.yml).

### Tag-triggered release (typical)

1. Bump `version` in `manifest.json` to the new version (e.g. `0.2.0`).
2. Commit: `git commit -am "chore: bump version to 0.2.0"`.
3. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
4. The workflow builds, lints, tests, updates `versions.json`, and publishes a GitHub release with `main.js`, `manifest.json`, and `styles.css` attached.

The tag name **must** match `manifest.json`'s `version` prefixed with `v`, or the workflow will fail.

### Manual release (workflow_dispatch)

From the Actions tab → "Release" workflow → "Run workflow", enter the version (without the `v` prefix). The workflow will create the tag if it doesn't exist, then build and release.

### What the workflow does

- Runs lint, typecheck, tests, and a production build.
- Asserts the tag version matches `manifest.json`.
- Appends the new version + `minAppVersion` to `versions.json` and commits back to the default branch.
- Creates a GitHub release with auto-generated release notes and the three Obsidian-required artifacts as separate assets (not zipped).
