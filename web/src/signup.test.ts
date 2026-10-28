import { describe, expect, it } from "vitest";
import { type Ready, calendarLinks, checkHouse, explain, post, subscribeBody } from "./signup";

const READY: Ready = { kind: "ready", postcode: "NE3 4XE", ons_code: "E08000021", name: "Newcastle upon Tyne", ask: "first_line" };
const TOKEN = "ab".repeat(32);
const URL_ = "https://script.google.com/macros/s/abc/exec";

describe("checkHouse", () => {
  it("tidies spaces and accepts a number, a name and a first line", () => {
    expect(checkHouse("  12  ", "house_number")).toEqual({ ok: true, value: "12" });
    expect(checkHouse("12A", "house_number")).toEqual({ ok: true, value: "12A" });
    expect(checkHouse("Rose   Cottage", "house_number")).toEqual({ ok: true, value: "Rose Cottage" });
    expect(checkHouse(" 12   High Street ", "first_line")).toEqual({ ok: true, value: "12 High Street" });
    expect(checkHouse("Flat 3, Rose House", "first_line")).toEqual({ ok: true, value: "Flat 3, Rose House" });
  });

  it("asks for something when it is empty, in words that fit the council", () => {
    expect(checkHouse("   ", "house_number")).toMatchObject({ ok: false, error: "Enter your house number or name." });
    expect(checkHouse("", "first_line")).toMatchObject({ ok: false, error: "Enter the first line of your address." });
  });

  it("refuses a bare number where the council needs the whole first line", () => {
    for (const bare of ["12", "12A", "Rose", "12,"]) {
      expect(checkHouse(bare, "first_line"), bare).toMatchObject({ ok: false });
    }
  });

  it("refuses anything that could be read as a formula or markup", () => {
    for (const bad of ["=1+1", "+44", "-1", "@SUM(A1)", "<b>1</b>", "1; DROP", "12\u0000", "x".repeat(101)]) {
      expect(checkHouse(bad, "house_number"), bad).toMatchObject({ ok: false });
    }
  });
});

describe("subscribeBody", () => {
  it("carries the council, the postcode as we normalised it, the house and the garden answer, and nothing else", () => {
    expect(subscribeBody(READY, "12 High Street", true)).toEqual({
      action: "subscribe",
      ons_code: "E08000021",
      postcode: "NE3 4XE",
      house_number: "12 High Street",
      garden: true,
    });
  });
});

describe("post", () => {
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

  it("sends plain text JSON to the script", async () => {
    let seen: { init?: RequestInit } = {};
    const f = (async (_url: string, init?: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ ok: true, token: TOKEN }));
    }) as unknown as typeof fetch;
    expect(await post(URL_, { action: "subscribe" }, f)).toEqual({ ok: true, token: TOKEN });
    expect((seen.init?.headers as Record<string, string>)["Content-Type"]).toBe("text/plain;charset=utf-8");
    expect(JSON.parse(seen.init?.body as string)).toEqual({ action: "subscribe" });
  });

  it("passes on the script's reason for saying no", async () => {
    expect(await post(URL_, {}, answer({ ok: false, error: "full" }))).toEqual({ ok: false, error: "full" });
  });

  it("treats a network failure, rubbish and a missing reason as errors, never as success", async () => {
    const down = (async () => {
      throw new TypeError("blocked");
    }) as typeof fetch;
    expect(await post(URL_, {}, down)).toEqual({ ok: false, error: "network" });
    expect(await post(URL_, {}, (async () => new Response("<html>", { status: 500 })) as typeof fetch)).toEqual({ ok: false, error: "network" });
    expect(await post(URL_, {}, answer({ ok: false }))).toEqual({ ok: false, error: "unknown" });
    expect(await post(URL_, {}, answer({}))).toEqual({ ok: false, error: "unknown" });
  });
});

describe("explain", () => {
  it("has plain words for every reason the script gives, and never shows the raw reason", () => {
    for (const error of ["network", "first line needed", "bad house_number", "bad address", "bad postcode", "council not supported yet", "too many feeds for this address", "full", "unauthorised", "x"]) {
      const text = explain(error);
      expect(text.length, error).toBeGreaterThan(10);
      expect(text, error).not.toMatch(/unauthorised|ons_code|uprn|secret/i);
    }
  });
});

describe("calendarLinks", () => {
  it("builds the private feed address and one link per calendar app", () => {
    const links = calendarLinks(URL_, TOKEN);
    expect(links?.https).toBe(`${URL_}?feed=${TOKEN}`);
    expect(links?.apple).toBe(`webcal://script.google.com/macros/s/abc/exec?feed=${TOKEN}`);
    expect(links?.google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(links?.apple ?? "")}`);
    expect(links?.outlook).toContain(encodeURIComponent(links?.https ?? ""));
  });

  it("refuses a script address that isn't https or a token that isn't ours", () => {
    expect(calendarLinks("http://example.com", TOKEN)).toBeNull();
    expect(calendarLinks(URL_, "short")).toBeNull();
    expect(calendarLinks("nope", TOKEN)).toBeNull();
  });
});
