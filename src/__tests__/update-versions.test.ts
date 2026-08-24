import { describe, it, expect } from "vitest";
import { updateVersionsJson } from "../../scripts/update-versions.mjs";

const BASE = JSON.stringify({ "0.1.0": "1.5.0", "0.1.1": "1.6.6" }, null, 2) + "\n";

describe("updateVersionsJson", () => {
  it("returns updated=true with the new entry added (2-space indent, trailing newline) when version is absent", () => {
    const result = updateVersionsJson(BASE, "0.2.0", "1.7.0");
    expect(result.updated).toBe(true);
    expect(result.text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(result.text);
    expect(parsed["0.2.0"]).toBe("1.7.0");
    expect(Object.keys(parsed)).toHaveLength(3);
  });

  it("returns updated=false with text unchanged when version already present", () => {
    const result = updateVersionsJson(BASE, "0.1.0", "1.5.0");
    expect(result.updated).toBe(false);
    expect(result.text).toBe(BASE);
  });

  it("preserves existing entries", () => {
    const result = updateVersionsJson(BASE, "0.3.0", "1.8.0");
    const parsed = JSON.parse(result.text);
    expect(parsed["0.1.0"]).toBe("1.5.0");
    expect(parsed["0.1.1"]).toBe("1.6.6");
    expect(parsed["0.3.0"]).toBe("1.8.0");
  });

  it("produces correct JSON format", () => {
    const result = updateVersionsJson(BASE, "0.4.0", "1.9.0");
    expect(result.text).toBe(JSON.stringify({
      "0.1.0": "1.5.0",
      "0.1.1": "1.6.6",
      "0.4.0": "1.9.0",
    }, null, 2) + "\n");
  });
});