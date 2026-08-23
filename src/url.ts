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
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (path.endsWith("/")) return "file";
    const last = path.split("/").filter(Boolean).pop();
    return last ?? "file";
  } catch {
    const clean = url.split("?")[0].split("#")[0];
    if (clean.endsWith("/")) return "file";
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
