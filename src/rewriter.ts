import { MediaRef } from "./types";

export interface Rewrite {
  ref: MediaRef;
  newUrl: string;
}

// rewrites must be non-overlapping (the scanner guarantees this).
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
      const altMatch = /^!\[([^\]]*)\]\(/.exec(ref.rawMatch);
      const alt = altMatch ? altMatch[1] : "";
      const url = newUrl.includes(")") ? `<${newUrl}>` : newUrl;
      return `![${alt}](${url})`;
    }
    case "wikilink": {
      const url = newUrl.includes("]]") ? newUrl.replace(/\]\]/g, "\\]\\]") : newUrl;
      return `![[${url}]]`;
    }
    case "html-img":
    case "html-source": {
      const escaped = newUrl.replace(/"/g, "&quot;");
      return ref.rawMatch.replace(/(\bsrc\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, `$1"${escaped}"`);
    }
    default: {
      const _exhaustive: never = ref.kind;
      void _exhaustive;
      return ref.rawMatch;
    }
  }
}