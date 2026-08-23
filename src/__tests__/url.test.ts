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

describe("hasImageExtension / hasAvExtension", () => {
  it("separates image vs av", () => {
    expect(hasImageExtension("cat.png")).toBe(true);
    expect(hasImageExtension("song.mp3")).toBe(false);
    expect(hasAvExtension("song.mp3")).toBe(true);
    expect(hasAvExtension("cat.png")).toBe(false);
  });
});
