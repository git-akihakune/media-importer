import { describe, it, expect } from "vitest";
import { scanNote, walkVault, ScannerConfig } from "../scanner";
import { FakeVault } from "./helpers/fake-vault";

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
    const note = "![](https://example.com/clip.mp4)";
    expect(scanNote(note, cfg({ mdAv: false }))).toHaveLength(0);
  });
});

describe("scanNote — edge cases", () => {
  it("handles markdown image with title attribute", () => {
    const note = `![cat](https://example.com/cat.png "a cat")`;
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
    expect(refs[0].rawMatch).toBe(note);
  });
  it("handles markdown image with no alt text", () => {
    const note = "![](https://example.com/cat.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
  });
  it("finds two images on the same line", () => {
    const note = "![a](https://x.com/a.png) ![b](https://x.com/b.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(2);
    expect(refs[0].url).toBe("https://x.com/a.png");
    expect(refs[1].url).toBe("https://x.com/b.png");
  });
  it("returns empty array for note with no media", () => {
    expect(scanNote("just text, no media", cfg())).toEqual([]);
    expect(scanNote("", cfg())).toEqual([]);
  });
  it("handles angle-bracket URLs", () => {
    const note = "![cat](<https://example.com/cat.png>)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
  });
  it("handles whitespace-tolerant markdown", () => {
    const note = '![cat]( https://example.com/cat.png "title" )';
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
  });
  it("preserves correct offsets for non-zero matches", () => {
    const note = "![a](https://x.com/a.png)\n![b](https://x.com/b.png)";
    const refs = scanNote(note, cfg());
    const bMatch = "![b](https://x.com/b.png)";
    expect(refs[1].rawStart).toBe(note.indexOf(bMatch));
    expect(refs[1].rawEnd).toBe(refs[1].rawStart + bMatch.length);
  });
  it("handles multibyte leading content without offset drift", () => {
    const note = "🐱 ![cat](https://example.com/cat.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    const expected = "![cat](https://example.com/cat.png)";
    expect(refs[0].rawStart).toBe(note.indexOf(expected));
    expect(refs[0].rawEnd).toBe(refs[0].rawStart + expected.length);
  });
});

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

describe("scanNote — wrapped image-link (click-to-zoom)", () => {
  it("detects [![alt](url)](url) and records linkUrl when href equals src", () => {
    const note = "[![cat](https://example.com/cat.png)](https://example.com/cat.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    const r = refs[0];
    expect(r.url).toBe("https://example.com/cat.png");
    expect(r.linkUrl).toBe("https://example.com/cat.png");
    expect(r.rawStart).toBe(0);
    expect(r.rawEnd).toBe(note.length);
    expect(r.rawMatch).toBe(note);
  });
  it("collapses to the embed: rawMatch covers the entire wrapper", () => {
    const inner = "![cat](https://example.com/cat.png)";
    const note = `[${inner}](https://example.com/cat.png)`;
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].rawMatch).toBe(note);
    expect(refs[0].rawMatch).not.toBe(inner);
  });
  it("leaves linkUrl unset when href differs from src (genuine citation)", () => {
    const note = "[![cat](https://example.com/cat.png)](https://example.com/article)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
    expect(refs[0].linkUrl).toBeUndefined();
    expect(refs[0].rawMatch).toBe("![cat](https://example.com/cat.png)");
  });
  it("handles title attribute on the wrapper link", () => {
    const note = '[![cat](https://example.com/cat.png)](https://example.com/cat.png "view")';
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].linkUrl).toBe("https://example.com/cat.png");
    expect(refs[0].rawMatch).toBe(note);
  });
  it("handles title attribute on the inner image", () => {
    const inner = '![cat](https://example.com/cat.png "a cat")';
    const note = `[${inner}](https://example.com/cat.png)`;
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].linkUrl).toBe("https://example.com/cat.png");
    expect(refs[0].rawMatch).toBe(note);
  });
  it("detects wrapped av embed", () => {
    const note = "[![](https://example.com/clip.mp4)](https://example.com/clip.mp4)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe("md-av");
    expect(refs[0].linkUrl).toBe("https://example.com/clip.mp4");
    expect(refs[0].rawMatch).toBe(note);
  });
  it("preserves correct offsets for wrapped embed after leading text", () => {
    const prefix = "intro\n";
    const wrapped = "[![cat](https://example.com/cat.png)](https://example.com/cat.png)";
    const note = prefix + wrapped;
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].rawStart).toBe(prefix.length);
    expect(refs[0].rawEnd).toBe(note.length);
  });
  it("does not false-positive on a bare image followed by trailing ()", () => {
    const note = "![cat](https://example.com/cat.png) and (text)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].linkUrl).toBeUndefined();
    expect(refs[0].rawMatch).toBe("![cat](https://example.com/cat.png)");
  });
  it("detects two wrapped images on the same line", () => {
    const a = "[![a](https://x.com/a.png)](https://x.com/a.png)";
    const b = "[![b](https://x.com/b.png)](https://x.com/b.png)";
    const note = `${a} ${b}`;
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(2);
    expect(refs[0].rawMatch).toBe(a);
    expect(refs[1].rawMatch).toBe(b);
    expect(refs[0].linkUrl).toBe("https://x.com/a.png");
    expect(refs[1].linkUrl).toBe("https://x.com/b.png");
  });
  it("detects wrapped image with empty alt", () => {
    const note = "[![](https://example.com/cat.png)](https://example.com/cat.png)";
    const refs = scanNote(note, cfg());
    expect(refs).toHaveLength(1);
    expect(refs[0].linkUrl).toBe("https://example.com/cat.png");
    expect(refs[0].rawMatch).toBe(note);
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

describe("scanNote — HTML edge cases", () => {
  it("handles wikilink with alias", () => {
    const note = "![[https://example.com/cat.png|my cat]]";
    const refs = scanNote(note, cfg({ wikilink: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
  });
  it("finds src when not the first attribute", () => {
    const note = `<img class="foo" src="https://example.com/cat.png" alt="bar">`;
    const refs = scanNote(note, cfg({ htmlImg: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
  });
  it("matches uppercase HTML tags and attributes", () => {
    const note = `<IMG SRC="https://example.com/cat.png">`;
    const refs = scanNote(note, cfg({ htmlImg: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
  });
  it("matches self-closing XHTML-style tags", () => {
    const note = `<img src="https://example.com/cat.png" />`;
    const refs = scanNote(note, cfg({ htmlImg: true }));
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe("https://example.com/cat.png");
  });
});

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
