import { MediaRef, MediaKind } from "./types";
import { isExternalUrl, hasImageExtension, hasAvExtension } from "./url";

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
      if (kind) push(refs, url, kind, m.index!, raw);
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
