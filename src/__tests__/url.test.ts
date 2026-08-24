import { describe, it, expect } from "vitest";
import {
  isExternalUrl,
  urlBasename,
  collisionSuffix,
  joinVaultPath,
  hasMediaExtension,
  hasImageExtension,
  hasAvExtension,
  MEDIA_EXTENSIONS,
  extForContentType,
  ensureMediaExt,
  isMediaContentType,
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
  it("decodes percent-encoded characters", () => {
    expect(urlBasename("https://example.com/mobile%20game%201.jpeg")).toBe("mobile game 1.jpeg");
  });
  it("leaves malformed percent-encoding intact", () => {
    expect(urlBasename("https://example.com/%E0%A4%A")).toBe("%E0%A4%A");
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

describe("hasImageExtension / hasAvExtension", () => {
  it("separates image vs av", () => {
    expect(hasImageExtension("cat.png")).toBe(true);
    expect(hasImageExtension("song.mp3")).toBe(false);
    expect(hasAvExtension("song.mp3")).toBe(true);
    expect(hasAvExtension("cat.png")).toBe(false);
  });
});

describe("extForContentType", () => {
  it("maps common content-types", () => {
    expect(extForContentType("image/png")).toBe("png");
    expect(extForContentType("image/jpeg")).toBe("jpg");
    expect(extForContentType("IMAGE/WebP")).toBe("webp");
    expect(extForContentType("video/mp4")).toBe("mp4");
  });
  it("ignores charset/parameters", () => {
    expect(extForContentType("image/png; charset=utf-8")).toBe("png");
  });
  it("returns null for unknown or empty", () => {
    expect(extForContentType("")).toBeNull();
    expect(extForContentType("application/json")).toBeNull();
  });
});

describe("ensureMediaExt", () => {
  it("appends extension derived from content-type when missing", () => {
    expect(ensureMediaExt("kvt8BeT8gH1enUqUZrtx", "image/png")).toBe("kvt8BeT8gH1enUqUZrtx.png");
    expect(ensureMediaExt("OIP.pYMLjvrQSq-mBRT3FAZ11wHaE8", "image/jpeg")).toBe("OIP.pYMLjvrQSq-mBRT3FAZ11wHaE8.jpg");
  });
  it("leaves names with a media extension alone", () => {
    expect(ensureMediaExt("cat.png", "image/jpeg")).toBe("cat.png");
    expect(ensureMediaExt("song.MP3", "audio/ogg")).toBe("song.MP3");
  });
  it("leaves names alone when content-type is unknown", () => {
    expect(ensureMediaExt("bar", "application/octet-stream")).toBe("bar");
    expect(ensureMediaExt("bar", "")).toBe("bar");
  });
});

describe("isMediaContentType", () => {
  it("returns true for known image/audio/video content-types", () => {
    expect(isMediaContentType("image/png")).toBe(true);
    expect(isMediaContentType("image/jpeg")).toBe(true);
    expect(isMediaContentType("video/mp4")).toBe(true);
    expect(isMediaContentType("audio/mpeg")).toBe(true);
  });
  it("ignores parameters", () => {
    expect(isMediaContentType("image/png; charset=utf-8")).toBe(true);
  });
  it("returns false for non-media content-types and empty", () => {
    expect(isMediaContentType("text/html")).toBe(false);
    expect(isMediaContentType("application/json")).toBe(false);
    expect(isMediaContentType("")).toBe(false);
  });
});
