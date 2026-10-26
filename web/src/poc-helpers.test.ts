import { describe, expect, it } from "vitest";
import { describeError, feedLinks, feedLinksForToken } from "./poc-helpers";

describe("feedLinks", () => {
  it("adds the feed parameter and a webcal variant", () => {
    expect(feedLinks("https://script.google.com/macros/s/abc/exec")).toEqual({
      https: "https://script.google.com/macros/s/abc/exec?feed=poc",
      webcal: "webcal://script.google.com/macros/s/abc/exec?feed=poc",
    });
  });

  it("rejects things that are not https URLs", () => {
    expect(feedLinks("not a url")).toBeNull();
    expect(feedLinks("http://example.com")).toBeNull();
  });
});

describe("feedLinksForToken", () => {
  const token = "ab".repeat(32);

  it("builds the https and webcal links", () => {
    expect(feedLinksForToken("https://script.google.com/macros/s/abc/exec", token)).toEqual({
      https: `https://script.google.com/macros/s/abc/exec?feed=${token}`,
      webcal: `webcal://script.google.com/macros/s/abc/exec?feed=${token}`,
    });
  });

  it("refuses a bad URL or token", () => {
    expect(feedLinksForToken("nope", token)).toBeNull();
    expect(feedLinksForToken("http://example.com", token)).toBeNull();
    expect(feedLinksForToken("https://script.google.com/macros/s/abc/exec", "short")).toBeNull();
  });
});

describe("describeError", () => {
  it("explains a blocked fetch", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toContain("cross-origin");
  });
});
