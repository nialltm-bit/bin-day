import { afterEach, describe, expect, it } from "vitest";
import { CHUNK_CHARS, type Remote, loadJson } from "./remote";
import { getCouncil, parseBankHolidays, resetRegistry, setBankHolidays, setCouncils, slimCouncils, bankHolidaysFor } from "./registry";

function fakeRemote(files: Record<string, string | null> = {}) {
  const cache = new Map<string, string>();
  const fetched: string[] = [];
  const puts: string[] = [];
  const remote: Remote = {
    fetchText: (url) => {
      fetched.push(url);
      return files[url] ?? null;
    },
    cacheGet: (key) => cache.get(key) ?? null,
    cachePut: (key, value) => {
      puts.push(key);
      cache.set(key, value);
    },
  };
  return { remote, cache, fetched, puts };
}

const URL_ = "https://raw.githubusercontent.com/owner/repo/main/registry/councils.json";
const parseList = (raw: unknown) => (Array.isArray(raw) ? (raw as number[]) : null);

describe("loadJson", () => {
  it("fetches, checks and caches the first time, then serves from the cache without fetching", () => {
    const { remote, fetched } = fakeRemote({ [URL_]: "[1,2,3]" });
    expect(loadJson(remote, "k", URL_, parseList, 600)).toEqual([1, 2, 3]);
    expect(loadJson(remote, "k", URL_, parseList, 600)).toEqual([1, 2, 3]);
    expect(fetched).toHaveLength(1);
  });

  it("caches only what the check kept, not the raw file", () => {
    const { remote, cache } = fakeRemote({ [URL_]: JSON.stringify([1, 2]) });
    loadJson(remote, "k", URL_, (raw) => (Array.isArray(raw) ? [raw[0]] : null), 600);
    expect(cache.get("k:0")).toBe("[1]");
  });

  it("returns null when the file can't be fetched, isn't JSON, or fails the check, so the caller keeps what it has", () => {
    expect(loadJson(fakeRemote({}).remote, "k", URL_, parseList, 600)).toBeNull();
    expect(loadJson(fakeRemote({ [URL_]: "<html>" }).remote, "k", URL_, parseList, 600)).toBeNull();
    expect(loadJson(fakeRemote({ [URL_]: '{"a":1}' }).remote, "k", URL_, parseList, 600)).toBeNull();
  });

  it("caches nothing for a file that failed", () => {
    const { remote, puts } = fakeRemote({ [URL_]: '{"a":1}' });
    loadJson(remote, "k", URL_, parseList, 600);
    expect(puts).toEqual([]);
  });

  it("splits a large file across cache entries and joins it back", () => {
    const big = Array.from({ length: 20000 }, (_, i) => i);
    const { remote, puts, fetched } = fakeRemote({ [URL_]: JSON.stringify(big) });
    expect(loadJson(remote, "k", URL_, parseList, 600)).toEqual(big);
    expect(puts.filter((k) => k !== "k:n").length).toBeGreaterThan(2);
    expect(loadJson(remote, "k", URL_, parseList, 600)).toEqual(big);
    expect(fetched).toHaveLength(1);
  });

  it("keeps each cache entry under the size limit", () => {
    const { remote, cache } = fakeRemote({ [URL_]: JSON.stringify(Array.from({ length: 50000 }, (_, i) => i)) });
    loadJson(remote, "k", URL_, parseList, 600);
    for (const [key, value] of cache) if (key !== "k:n") expect(value.length).toBeLessThanOrEqual(CHUNK_CHARS);
  });

  it("treats a cache with a missing piece as empty and fetches again", () => {
    const big = Array.from({ length: 20000 }, (_, i) => i);
    const { remote, cache, fetched } = fakeRemote({ [URL_]: JSON.stringify(big) });
    loadJson(remote, "k", URL_, parseList, 600);
    cache.delete("k:1");
    expect(loadJson(remote, "k", URL_, parseList, 600)).toEqual(big);
    expect(fetched).toHaveLength(2);
  });

  it("ignores a damaged cache entry and fetches again", () => {
    const { remote, cache, fetched } = fakeRemote({ [URL_]: "[1]" });
    cache.set("k:n", "1");
    cache.set("k:0", "{not json");
    expect(loadJson(remote, "k", URL_, parseList, 600)).toEqual([1]);
    expect(fetched).toHaveLength(1);
  });
});

describe("slimCouncils", () => {
  const good = {
    ons_code: "E06000099",
    name: "Numberton",
    status: "supported",
    schedule: "full",
    inputs: ["postcode", "house_number"],
    house_input: "first_line",
    source: { type: "ukbcd", module: "X", url: "https://x" },
    notes: "a long note that the script does not need",
    test_address: { postcode: "AA1 1AA" },
    bin_types: { "General Waste": { stream: "general", label: "General waste", colour: "black", every_weeks: 2, extra: 1 } },
  };

  it("keeps only the fields the script reads", () => {
    expect(slimCouncils({ councils: [good] })).toEqual([
      {
        ons_code: "E06000099",
        name: "Numberton",
        status: "supported",
        schedule: "full",
        inputs: ["postcode", "house_number"],
        house_input: "first_line",
        bin_types: { "General Waste": { stream: "general", label: "General waste", every_weeks: 2 } },
      },
    ]);
  });

  it("leaves out an entry that doesn't pass and keeps the rest", () => {
    const bad = [{ ...good, ons_code: "nope" }, { ...good, status: "working" }, { ...good, name: "" }, { ...good, bin_types: { A: { stream: "glass" } } }, 7, null];
    const result = slimCouncils({ councils: [...bad, { ...good, ons_code: "E06000098" }] });
    expect(result?.map((c) => c.ons_code)).toEqual(["E06000098"]);
  });

  it("refuses a file with no usable council, or the wrong shape", () => {
    for (const raw of [null, {}, { councils: "x" }, { councils: [] }, { councils: [{ ons_code: "nope" }] }, []]) expect(slimCouncils(raw)).toBeNull();
  });

  it("drops a bad frequency rather than trusting it", () => {
    const result = slimCouncils({ councils: [{ ...good, bin_types: { A: { stream: "food", every_weeks: 9 }, B: { stream: "food", every_weeks: 1.5 } } }] });
    expect(result?.[0].bin_types).toEqual({ A: { stream: "food" }, B: { stream: "food" } });
  });
});

describe("parseBankHolidays", () => {
  const good = { regions: { "england-and-wales": { verified: true, dates: ["2026-12-25"], extra: 1 }, scotland: { verified: false, dates: [] } } };

  it("keeps the regions, their dates and whether they are verified", () => {
    expect(parseBankHolidays(good)).toEqual({ regions: { "england-and-wales": { verified: true, dates: ["2026-12-25"] }, scotland: { verified: false, dates: [] } } });
  });

  it("refuses a file without England and Wales, or with a bad date", () => {
    expect(parseBankHolidays({ regions: { scotland: { verified: true, dates: [] } } })).toBeNull();
    expect(parseBankHolidays({ regions: { "england-and-wales": { verified: true, dates: ["25 Dec"] } } })).toBeNull();
    expect(parseBankHolidays(null)).toBeNull();
    expect(parseBankHolidays({ regions: { "england-and-wales": { verified: true } } })).toBeNull();
  });
});

describe("swapping the registry the script uses", () => {
  afterEach(() => resetRegistry());

  it("uses the live councils once they are set, and the bundled ones again after a reset", () => {
    expect(getCouncil("E06000099")).toBeUndefined();
    setCouncils([{ ons_code: "E06000099", name: "Numberton", status: "supported" }]);
    expect(getCouncil("E06000099")?.name).toBe("Numberton");
    expect(getCouncil("E06000022")).toBeUndefined();
    resetRegistry();
    expect(getCouncil("E06000022")?.name).toContain("Bath");
  });

  it("uses live bank holidays once they are set", () => {
    setBankHolidays({ regions: { "england-and-wales": { verified: true, dates: ["2099-01-01"] } } });
    expect(bankHolidaysFor("E06000022")).toEqual(["2099-01-01"]);
    resetRegistry();
    expect(bankHolidaysFor("E06000022")).not.toEqual(["2099-01-01"]);
  });
});
