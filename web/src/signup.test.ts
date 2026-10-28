import { describe, expect, it } from "vitest";
import { type Ready, calendarLinks, checkHouse, explain, formatDay, pollUpcoming, post, subscribeBody } from "./signup";

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
    expect(await post(URL_, { action: "subscribe" }, f)).toMatchObject({ ok: true, token: TOKEN });
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

describe("pollUpcoming", () => {
  const reply = (body: unknown) => new Response(JSON.stringify(body));
  /** A fetch that gives the next answer each time it is asked. */
  const sequence = (...answers: (unknown | Error)[]): typeof fetch => {
    let i = 0;
    return (async () => {
      const next = answers[Math.min(i++, answers.length - 1)];
      if (next instanceof Error) throw next;
      return reply(next);
    }) as typeof fetch;
  };
  const noWait = async () => {};
  const DAYS = [{ date: "2026-10-30", label: "rubbish + recycling", projected: false }];

  it("waits while pending, then returns the days", async () => {
    const asks: number[] = [];
    const f = sequence({ ok: true, status: "pending", collections: [] }, { ok: true, status: "pending", collections: [] }, { ok: true, status: "ready", collections: DAYS });
    expect(await pollUpcoming(URL_, TOKEN, { fetch: f, sleep: noWait, onAsk: (n) => asks.push(n) })).toEqual({ status: "ready", days: DAYS });
    expect(asks).toEqual([1, 2, 3]);
  });

  it("sends the token and nothing about the address", async () => {
    let body = "";
    const f = (async (_u: string, init?: RequestInit) => {
      body = init?.body as string;
      return reply({ ok: true, status: "ready", collections: DAYS });
    }) as unknown as typeof fetch;
    await pollUpcoming(URL_, TOKEN, { fetch: f, sleep: noWait });
    expect(JSON.parse(body)).toEqual({ action: "upcoming", token: TOKEN });
  });

  it("stops at once when the fetch failed or the token is unknown", async () => {
    expect(await pollUpcoming(URL_, TOKEN, { fetch: sequence({ ok: true, status: "failed", collections: [] }), sleep: noWait })).toEqual({ status: "failed" });
    expect(await pollUpcoming(URL_, TOKEN, { fetch: sequence({ ok: false, error: "not found" }), sleep: noWait })).toEqual({ status: "failed" });
  });

  it("gives up and says it is slow after the allowed number of asks", async () => {
    let asked = 0;
    const f = (async () => {
      asked++;
      return reply({ ok: true, status: "pending", collections: [] });
    }) as unknown as typeof fetch;
    expect(await pollUpcoming(URL_, TOKEN, { fetch: f, sleep: noWait, attempts: 4 })).toEqual({ status: "slow" });
    expect(asked).toBe(4);
  });

  it("gives up after three network failures in a row, but rides out a single one", async () => {
    const down = new TypeError("blocked");
    expect(await pollUpcoming(URL_, TOKEN, { fetch: sequence(down), sleep: noWait, attempts: 30 })).toEqual({ status: "slow" });
    const once = sequence(down, { ok: true, status: "ready", collections: DAYS });
    expect(await pollUpcoming(URL_, TOKEN, { fetch: once, sleep: noWait })).toEqual({ status: "ready", days: DAYS });
  });

  it("does not trust a ready answer with malformed days", async () => {
    const f = sequence({ ok: true, status: "ready", collections: [{ date: "tomorrow", label: 5 }] });
    expect(await pollUpcoming(URL_, TOKEN, { fetch: f, sleep: noWait, attempts: 2 })).toEqual({ status: "slow" });
  });

  it("waits the interval between asks but not after the last", async () => {
    const waits: number[] = [];
    const f = sequence({ ok: true, status: "pending", collections: [] });
    await pollUpcoming(URL_, TOKEN, { fetch: f, sleep: async (ms) => void waits.push(ms), attempts: 3, intervalMs: 7 });
    expect(waits).toEqual([7, 7]);
  });
});

describe("formatDay", () => {
  it("writes a calendar day as weekday, day and month, whatever the viewer's time zone", () => {
    expect(formatDay("2026-10-29")).toBe("Thu 29 Oct");
    expect(formatDay("2026-01-01")).toBe("Thu 1 Jan");
    expect(formatDay("2026-03-29")).toBe("Sun 29 Mar");
  });
});
