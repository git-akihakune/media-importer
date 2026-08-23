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
