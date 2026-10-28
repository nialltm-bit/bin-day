import { describe, expect, it } from "vitest";
import { deleteFeed, messageForDelete, tokenFrom } from "./delete-feed";

const TOKEN = "0123456789abcdef".repeat(4);

function replying(body: unknown): { fetch: typeof fetch; sent: string[] } {
  const sent: string[] = [];
  const fake = (async (_url: string, init: RequestInit) => {
    sent.push(String(init.body));
    return { json: async () => body };
  }) as unknown as typeof fetch;
  return { fetch: fake, sent };
}

describe("tokenFrom", () => {
  it("finds the token in a calendar link, a webcal link or on its own", () => {
    expect(tokenFrom(`https://script.google.com/macros/s/AKfy/exec?feed=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFrom(`webcal://script.google.com/macros/s/AKfy/exec?feed=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFrom(`  ${TOKEN.toUpperCase()}  `)).toBe(TOKEN);
  });
  it("refuses text with no token, a short one, a longer run, or two different ones", () => {
    expect(tokenFrom("")).toBeNull();
    expect(tokenFrom("feed=abc123")).toBeNull();
    expect(tokenFrom(TOKEN + "0")).toBeNull();
    expect(tokenFrom(`${TOKEN} ${"f".repeat(64)}`)).toBeNull();
  });
});

describe("deleteFeed", () => {
  it("sends only the token, and says it is deleted", async () => {
    const { fetch, sent } = replying({ ok: true });
    expect(await deleteFeed("https://script.example/exec", `https://x/exec?feed=${TOKEN}`, fetch)).toEqual({ kind: "deleted" });
    expect(JSON.parse(sent[0])).toEqual({ action: "unsubscribe", token: TOKEN });
  });
  it("sends nothing for a link without a token", async () => {
    const { fetch, sent } = replying({ ok: true });
    expect(await deleteFeed("https://script.example/exec", "nonsense", fetch)).toEqual({ kind: "bad_link" });
    expect(sent).toEqual([]);
  });
  it("tells an unknown feed from a failure", async () => {
    expect(await deleteFeed("https://s/exec", TOKEN, replying({ ok: false, error: "not found" }).fetch)).toEqual({ kind: "not_found" });
    expect(await deleteFeed("https://s/exec", TOKEN, replying({ ok: false, error: "full" }).fetch)).toEqual({ kind: "error" });
  });
  it("has a plain sentence for every result", () => {
    for (const kind of ["deleted", "not_found", "bad_link", "error"] as const) expect(messageForDelete({ kind }).length).toBeGreaterThan(20);
  });
});
