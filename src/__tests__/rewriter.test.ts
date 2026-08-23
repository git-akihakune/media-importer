import { describe, it, expect } from "vitest";
import { rewriteNote, Rewrite } from "../rewriter";

const rewrite = (note: string, rawMatch: string, url: string, newUrl: string): Rewrite => ({
  ref: { notePath: "x.md", rawMatch, rawStart: note.indexOf(rawMatch), rawEnd: note.indexOf(rawMatch) + rawMatch.length, url, kind: "md-image" },
  newUrl,
});

describe("rewriteNote", () => {
  it("replaces a single markdown image with a wikilink", () => {
    const note = "![cat](https://x.com/cat.png)";
    const r = rewriteNote(note, [rewrite(note, note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![cat](media/cat.png)");
  });
  it("replaces in reverse order so earlier offsets stay valid", () => {
    const note = "![a](https://x.com/a.png)\n![b](https://x.com/b.png)";
    const r = rewriteNote(note, [
      rewrite(note, "![a](https://x.com/a.png)", "https://x.com/a.png", "media/a.png"),
      rewrite(note, "![b](https://x.com/b.png)", "https://x.com/b.png", "media/b.png"),
    ]);
    expect(r).toBe("![a](media/a.png)\n![b](media/b.png)");
  });
  it("preserves wikilink syntax", () => {
    const note = "![[https://x.com/cat.png]]";
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/cat.png", kind: "wikilink" },
      newUrl: "media/cat.png",
    }]);
    expect(r).toBe("![[media/cat.png]]");
  });
  it("preserves html img syntax", () => {
    const note = `<img src="https://x.com/cat.png">`;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/cat.png", kind: "html-img" },
      newUrl: "https://cdn.example.com/cat.png",
    }]);
    expect(r).toBe(`<img src="https://cdn.example.com/cat.png">`);
  });
  it("returns original note when rewrites is empty", () => {
    expect(rewriteNote("unchanged", [])).toBe("unchanged");
  });
});

describe("rewriteNote — syntax coverage", () => {
  it("handles md-av kind", () => {
    const note = "![](https://x.com/clip.mp4)";
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/clip.mp4", kind: "md-av" },
      newUrl: "media/clip.mp4",
    }]);
    expect(r).toBe("![](media/clip.mp4)");
  });
  it("handles html-source kind (video tag)", () => {
    const note = `<video src='https://x.com/clip.mp4'></video>`;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/clip.mp4", kind: "html-source" },
      newUrl: "https://cdn.example.com/clip.mp4",
    }]);
    expect(r).toBe(`<video src="https://cdn.example.com/clip.mp4"></video>`);
  });
  it("normalizes single-quote HTML src to double-quote", () => {
    const note = `<img src='https://x.com/cat.png'>`;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/cat.png", kind: "html-img" },
      newUrl: "https://cdn.example.com/cat.png",
    }]);
    expect(r).toBe(`<img src="https://cdn.example.com/cat.png">`);
  });
  it("preserves other HTML attributes when replacing src", () => {
    const note = `<img class="photo" src="https://x.com/cat.png" alt="a cat" width="100">`;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/cat.png", kind: "html-img" },
      newUrl: "https://cdn.example.com/cat.png",
    }]);
    expect(r).toBe(`<img class="photo" src="https://cdn.example.com/cat.png" alt="a cat" width="100">`);
  });
  it("preserves alt text in markdown image", () => {
    const note = "![my cat](https://x.com/cat.png)";
    const r = rewriteNote(note, [rewrite(note, note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![my cat](media/cat.png)");
  });
  it("handles rewrite at end of note", () => {
    const prefix = "intro text\n";
    const embed = "![cat](https://x.com/cat.png)";
    const note = prefix + embed;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: embed, rawStart: prefix.length, rawEnd: note.length, url: "https://x.com/cat.png", kind: "md-image" },
      newUrl: "media/cat.png",
    }]);
    expect(r).toBe(prefix + "![cat](media/cat.png)");
  });
  it("handles mixed syntaxes in one note", () => {
    const md = "![a](https://x.com/a.png)";
    const html = `<img src="https://x.com/b.png">`;
    const note = md + "\n" + html;
    const r = rewriteNote(note, [
      { ref: { notePath: "x.md", rawMatch: md, rawStart: 0, rawEnd: md.length, url: "https://x.com/a.png", kind: "md-image" }, newUrl: "media/a.png" },
      { ref: { notePath: "x.md", rawMatch: html, rawStart: md.length + 1, rawEnd: note.length, url: "https://x.com/b.png", kind: "html-img" }, newUrl: "https://cdn.example.com/b.png" },
    ]);
    expect(r).toBe("![a](media/a.png)\n" + `<img src="https://cdn.example.com/b.png">`);
  });
});

describe("rewriteNote — newUrl sanitization", () => {
  it("wraps markdown URL in angle brackets when it contains )", () => {
    const note = "![cat](https://x.com/cat.png)";
    const r = rewriteNote(note, [rewrite(note, note, "https://x.com/cat.png", "media/cat)1.png")]);
    expect(r).toBe("![cat](<media/cat)1.png>)");
  });
  it("escapes double-quotes in HTML src attribute", () => {
    const note = `<img src="https://x.com/cat.png">`;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/cat.png", kind: "html-img" },
      newUrl: `cdn/a"b.png`,
    }]);
    expect(r).toBe(`<img src="cdn/a&quot;b.png">`);
  });
});

describe("rewriteNote — wrapped image-link collapse", () => {
  const wrappedRef = (note: string, url: string, newUrl: string): Rewrite => ({
    ref: {
      notePath: "x.md",
      rawMatch: note,
      rawStart: 0,
      rawEnd: note.length,
      url,
      kind: "md-image",
      linkUrl: url,
    },
    newUrl,
  });

  it("collapses [![alt](url)](url) to ![alt](newUrl)", () => {
    const note = "[![cat](https://x.com/cat.png)](https://x.com/cat.png)";
    const r = rewriteNote(note, [wrappedRef(note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![cat](media/cat.png)");
  });
  it("collapses wrapped embed with empty alt", () => {
    const note = "[![](https://x.com/cat.png)](https://x.com/cat.png)";
    const r = rewriteNote(note, [wrappedRef(note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![](media/cat.png)");
  });
  it("collapses wrapped av embed", () => {
    const note = "[![](https://x.com/clip.mp4)](https://x.com/clip.mp4)";
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: note, rawStart: 0, rawEnd: note.length, url: "https://x.com/clip.mp4", kind: "md-av", linkUrl: "https://x.com/clip.mp4" },
      newUrl: "media/clip.mp4",
    }]);
    expect(r).toBe("![](media/clip.mp4)");
  });
  it("collapses wrapped embed with title on inner image", () => {
    const inner = '![cat](https://x.com/cat.png "a cat")';
    const note = `[${inner}](https://x.com/cat.png)`;
    const r = rewriteNote(note, [wrappedRef(note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![cat](media/cat.png)");
  });
  it("collapses wrapped embed with title on wrapper link", () => {
    const note = '[![cat](https://x.com/cat.png)](https://x.com/cat.png "view")';
    const r = rewriteNote(note, [wrappedRef(note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![cat](media/cat.png)");
  });
  it("collapses wrapped embed with angle-bracket URLs", () => {
    const note = "[![cat](<https://x.com/cat.png>)](<https://x.com/cat.png>)";
    const r = rewriteNote(note, [wrappedRef(note, "https://x.com/cat.png", "media/cat.png")]);
    expect(r).toBe("![cat](media/cat.png)");
  });
  it("sanitizes newUrl containing ) in collapsed output", () => {
    const note = "[![cat](https://x.com/cat.png)](https://x.com/cat.png)";
    const r = rewriteNote(note, [wrappedRef(note, "https://x.com/cat.png", "media/cat)1.png")]);
    expect(r).toBe("![cat](<media/cat)1.png>)");
  });
  it("collapses two wrapped embeds in the same note", () => {
    const a = "[![a](https://x.com/a.png)](https://x.com/a.png)";
    const b = "[![b](https://x.com/b.png)](https://x.com/b.png)";
    const note = `${a}\n${b}`;
    const r = rewriteNote(note, [
      { ref: { notePath: "x.md", rawMatch: a, rawStart: 0, rawEnd: a.length, url: "https://x.com/a.png", kind: "md-image", linkUrl: "https://x.com/a.png" }, newUrl: "media/a.png" },
      { ref: { notePath: "x.md", rawMatch: b, rawStart: a.length + 1, rawEnd: note.length, url: "https://x.com/b.png", kind: "md-image", linkUrl: "https://x.com/b.png" }, newUrl: "media/b.png" },
    ]);
    expect(r).toBe("![a](media/a.png)\n![b](media/b.png)");
  });
  it("collapses wrapped embed surrounded by text", () => {
    const prefix = "before ";
    const wrapped = "[![cat](https://x.com/cat.png)](https://x.com/cat.png)";
    const suffix = " after";
    const note = prefix + wrapped + suffix;
    const r = rewriteNote(note, [{
      ref: { notePath: "x.md", rawMatch: wrapped, rawStart: prefix.length, rawEnd: prefix.length + wrapped.length, url: "https://x.com/cat.png", kind: "md-image", linkUrl: "https://x.com/cat.png" },
      newUrl: "media/cat.png",
    }]);
    expect(r).toBe(`${prefix}![cat](media/cat.png)${suffix}`);
  });
});