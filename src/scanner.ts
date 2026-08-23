import { MediaRef, MediaKind } from "./types";
import { isExternalUrl, hasImageExtension, hasAvExtension } from "./url";
import { VaultAdapter } from "./vault-adapter";
export type { VaultAdapter };

export interface ScannerConfig {
  mdImage: boolean;
  mdAv: boolean;
  wikilink: boolean;
  htmlImg: boolean;
  htmlAv: boolean;
}

const MD_EMBED_RE = /!\[([^\]]*)\]\(\s*([^\s)]+)\s*(?:"[^"]*")?\s*\)/g;
const WIKILINK_EMBED_RE = /!\[\[(https?:\/\/[^|\]]+)(?:\|[^\]]*)?\]\]/g;
const HTML_IMG_RE = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^'">\s]+))[^>]*>/gi;
const HTML_AV_RE = /<(?:video|audio|source)\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^'">\s]+))[^>]*>/gi;

export function scanNote(note: string, cfg: ScannerConfig): MediaRef[] {
  const refs: MediaRef[] = [];

  if (cfg.mdImage || cfg.mdAv) {
    for (const m of note.matchAll(MD_EMBED_RE)) {
      const raw = m[0];
      let url = m[2];
      if (url.startsWith("<") && url.endsWith(">")) {
        url = url.slice(1, -1);
      }
      if (!isExternalUrl(url)) continue;
      let kind: MediaKind | null = null;
      if (hasAvExtension(url) && cfg.mdAv) kind = "md-av";
      else if (hasImageExtension(url) && cfg.mdImage) kind = "md-image";
      else if (!hasAvExtension(url) && !hasImageExtension(url) && cfg.mdImage) kind = "md-image";
      if (kind) {
        const wrapped = detectWrap(note, m.index!, raw, url);
        push(refs, url, kind, wrapped.start, wrapped.raw, wrapped.linkUrl);
      }
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

function push(refs: MediaRef[], url: string, kind: MediaKind, start: number, raw: string, linkUrl?: string): void {
  refs.push({ notePath: "", rawMatch: raw, rawStart: start, rawEnd: start + raw.length, url, kind, linkUrl });
}

/**
 * If the embed at `start` is wrapped as `[<embed>](linkUrl)` and `linkUrl`
 * equals the embed's `url`, return the full wrapper span so the rewriter can
 * collapse it. Otherwise return the embed unchanged.
 *
 * Why strict equality: a click-to-zoom link repeats the image URL. A genuine
 * citation (`[![img](a)](b)`) points somewhere else and is left intact.
 */
function detectWrap(note: string, start: number, raw: string, url: string): { start: number; raw: string; linkUrl?: string } {
  if (start > 0 && note[start - 1] === "[") {
    const innerEnd = start + raw.length;
    if (innerEnd < note.length && note[innerEnd] === "]") {
      const after = note.slice(innerEnd + 1);
      const linkMatch = /^\(\s*([^\s)]+)\s*(?:"[^"]*")?\s*\)/.exec(after);
      if (linkMatch) {
        let linkUrl = linkMatch[1];
        if (linkUrl.startsWith("<") && linkUrl.endsWith(">")) {
          linkUrl = linkUrl.slice(1, -1);
        }
        if (linkUrl === url) {
          const fullRaw = note.slice(start - 1, innerEnd + 1 + linkMatch[0].length);
          return { start: start - 1, raw: fullRaw, linkUrl };
        }
      }
    }
  }
  return { start, raw };
}

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
