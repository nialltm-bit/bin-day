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
function load(properties: Record<string, string> = {}, fetched: Fetched = {}) {
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
    Utilities: { formatDate: () => "2026102812", getUuid: () => "00000000-0000-4000-8000-000000000000" },
    UrlFetchApp: {
      fetch: (url: string, options: Record<string, unknown>) => {
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
