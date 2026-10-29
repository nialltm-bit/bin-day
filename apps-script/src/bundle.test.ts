/**
 * Checks the built file the way Apps Script will use it: loaded as one script, with its entry points found by name at the
 * top level. This reads dist/Code.js, which CI checks is up to date.
 */
import { describe, expect, it } from "vitest";
import code from "../dist/Code.js?raw";

interface Fetched {
  url?: string;
  options?: Record<string, unknown>;
}

/** Runs the built script with stand-ins for Apps Script's services, and returns the functions it declares at the top level. */
function load(properties: Record<string, string> = {}, fetched: Fetched = {}, files: Record<string, string | undefined> = {}) {
  const cache = new Map<string, string>();
  const rawFetches: string[] = [];
  (fetched as Fetched & { rawFetches?: string[] }).rawFetches = rawFetches;
  const output = (text: string) => ({
    text,
    mime: "",
    setMimeType(mime: string) {
      this.mime = mime;
      return this;
    },
  });
  const services = {
    console: { log: () => {}, error: () => {} },
    ContentService: { createTextOutput: output, MimeType: { JSON: "json", ICAL: "ical" } },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => properties[k] ?? null,
        setProperty: (k: string, v: string) => void (properties[k] = v),
      }),
    },
    Utilities: {
      formatDate: () => "2026102812",
      getUuid: () => "00000000-0000-4000-8000-000000000000",
      // Some signed bytes, as Apps Script returns them; the real HMAC is checked in the script, this checks it is wired up.
      computeHmacSha256Signature: (text: string) => Array.from({ length: 32 }, (_, i) => ((text.length * 31 + i * 17) % 256) - 128),
    },
    CacheService: {
      getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => void cache.set(k, v) }),
    },
    UrlFetchApp: {
      fetch: (url: string, options: Record<string, unknown>) => {
        if (url.startsWith("https://raw.githubusercontent.com/")) {
          rawFetches.push(url);
          const body = files[url];
          return { getResponseCode: () => (body === undefined ? 404 : 200), getContentText: () => body ?? "" };
        }
        fetched.url = url;
        fetched.options = options;
        return { getResponseCode: () => 204 };
      },
    },
  };
  // Top-level function declarations are local to the function body here, so the ones the editor lists are returned by name.
  const run = new Function(...Object.keys(services), `${code}\nreturn { doGet, doPost, testFetchRequest };`);
  return run(...Object.values(services)) as {
    doGet: (e: unknown) => { text: string };
    doPost: (e: unknown) => { text: string };
    testFetchRequest: () => void;
  };
}

describe("the built script", () => {
  it("uses no syntax the Apps Script editor rejects (it fails the whole file on a ??= it can't parse)", () => {
    expect(code).not.toMatch(/\?\?=|\|\|=|&&=/);
  });

  it("declares its entry points as plain top-level functions, which is what the editor's Run list shows", () => {
    const declared = [...code.matchAll(/^function (\w+)\(/gm)].map((m) => m[1]);
    expect(declared).toEqual(["doGet", "doPost", "testFetchRequest"]);
  });

  it("answers a plain GET from the top level, so the web app works", () => {
    const reply = load().doGet({ parameter: {} });
    expect(JSON.parse(reply.text)).toMatchObject({ ok: true, service: "bin-day" });
  });

  it("answers a POST from the top level", () => {
    const reply = load().doPost({ postData: { contents: JSON.stringify({ action: "join_waitlist", ons_code: "nope" }) } });
    expect(JSON.parse(reply.text)).toEqual({ ok: false, error: "bad ons_code" });
  });

  it("runs testFetchRequest from the top level and asks GitHub, with the token, for the scheduled fetch", () => {
    const fetched: Fetched = {};
    load({ GITHUB_TOKEN: "ghp_test", GITHUB_REPO: "owner/repo" }, fetched).testFetchRequest();
    expect(fetched.url).toBe("https://api.github.com/repos/owner/repo/actions/workflows/fetch-scheduled.yml/dispatches");
    expect((fetched.options?.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
    expect(JSON.parse(fetched.options?.payload as string)).toEqual({ ref: "main" });
  });

  it("does nothing, and says so, when the setup isn't done", () => {
    const fetched: Fetched = {};
    load({}, fetched).testFetchRequest();
    expect(fetched.url).toBeUndefined();
  });
});

describe("the live council list", () => {
  const RAW = "https://raw.githubusercontent.com/nialltm-bit/bin-day/main/registry/councils.json";
  const subscribe = (script: ReturnType<typeof load>) =>
    JSON.parse(script.doPost({ postData: { contents: JSON.stringify({ action: "subscribe", ons_code: "E06000099", uprn: "1" }) } }).text);
  const numberton = { ons_code: "E06000099", name: "Numberton", status: "supported", schedule: "full", inputs: ["postcode", "house_number"], bin_types: {} };

  it("doesn't know a council that is only on GitHub unless it loads the live list", () => {
    expect(subscribe(load())).toEqual({ ok: false, error: "council not supported yet" });
  });

  it("recognises a council that is only in the live list, with no redeploy", () => {
    const script = load({}, {}, { [RAW]: JSON.stringify({ councils: [numberton] }) });
    // Past the council check, so the next thing missing is the postcode it needs.
    expect(subscribe(script)).toEqual({ ok: false, error: "postcode needed" });
  });

  it("fetches the live list once and then serves it from the cache", () => {
    const fetched: Fetched = {};
    const script = load({}, fetched, { [RAW]: JSON.stringify({ councils: [numberton] }) });
    subscribe(script);
    subscribe(script);
    subscribe(script);
    expect((fetched as Fetched & { rawFetches: string[] }).rawFetches.filter((u) => u === RAW)).toHaveLength(1);
  });

  it("falls back to the bundled list if the live one is missing or broken", () => {
    expect(subscribe(load({}, {}, { [RAW]: "<html>not json" }))).toEqual({ ok: false, error: "council not supported yet" });
    expect(subscribe(load({}, {}, { [RAW]: JSON.stringify({ councils: [] }) }))).toEqual({ ok: false, error: "council not supported yet" });
  });

  it("still serves a council from the bundled list when the live list can't be reached", () => {
    const script = load();
    const reply = JSON.parse(script.doPost({ postData: { contents: JSON.stringify({ action: "subscribe", ons_code: "E06000022", uprn: "nope" }) } }).text);
    expect(reply).toEqual({ ok: false, error: "bad uprn" }); // got as far as checking the UPRN, so B&NES was recognised
  });

  it("reads the repository from the GITHUB_REPO setting if there is one", () => {
    const other = "https://raw.githubusercontent.com/someone/else/main/registry/councils.json";
    const script = load({ GITHUB_REPO: "someone/else" }, {}, { [other]: JSON.stringify({ councils: [numberton] }) });
    expect(subscribe(script)).toEqual({ ok: false, error: "postcode needed" });
  });
});
