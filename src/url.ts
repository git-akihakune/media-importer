export const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico", "tiff",
]);

export const AV_EXTENSIONS = new Set([
  "mp3", "ogg", "wav", "flac", "aac", "m4a", "opus",
  "mp4", "webm", "mov", "mkv", "avi", "m4v",
]);

export const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...AV_EXTENSIONS]);

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function urlBasename(url: string): string {
  const pick = (path: string): string => {
    if (path.endsWith("/")) return "file";
    const last = path.split("/").filter(Boolean).pop();
    if (!last) return "file";
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  };
  try {
    const u = new URL(url);
    return pick(u.pathname);
  } catch {
    const clean = url.split("?")[0].split("#")[0];
    return pick(clean);
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

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/x-icon": "ico",
  "image/tiff": "tiff",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/opus": "opus",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
};

export function extForContentType(contentType: string): string | null {
  if (!contentType) return null;
  const base = contentType.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXT[base] ?? null;
}

export function isMediaContentType(contentType: string): boolean {
  return extForContentType(contentType) !== null;
}

export function ensureMediaExt(name: string, contentType: string): string {
  if (hasMediaExtension(name)) return name;
  const ext = extForContentType(contentType);
  if (!ext) return name;
  return `${name}.${ext}`;
}

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
