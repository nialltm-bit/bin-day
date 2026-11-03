import { describe, expect, it } from "vitest";
import { feedLinksForToken } from "./feed-links";

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
