import { beforeEach, describe, expect, it } from "vitest";
import { type AddressRow, type Deps, type ResultRow, type Tables, handle, safeEqual } from "./service";

const SECRET = "s3cret-value";
const NOW = "2026-10-26T22:11:12+00:00";
const COLLECTIONS = [
  { date: "2026-10-30", bin_name: "Food Recycling Collection Bin", stream: "food" },
  { date: "2026-10-30", bin_name: "Black Rubbish Bin (140L)", stream: "general" },
];

function memoryTables() {
  const addresses: AddressRow[] = [];
  const results = new Map<string, ResultRow>();
  const tables: Tables = {
    addresses: () => addresses.map((a) => ({ ...a })),
    addAddress: (row) => void addresses.push({ ...row }),
    getResult: (uprn) => results.get(uprn) ?? null,
    putResult: (row) => void results.set(row.uprn, JSON.parse(JSON.stringify(row)) as ResultRow),
  };
  return { tables, addresses, results };
}

let store: ReturnType<typeof memoryTables>;
let deps: Deps;

function call(body: Record<string, unknown>, withSecret = true) {
  return handle(withSecret ? { secret: SECRET, ...body } : body, deps);
}

beforeEach(() => {
  store = memoryTables();
  deps = { secret: SECRET, tables: store.tables };
});

describe("authentication", () => {
  it("refuses requests without the secret", () => {
    expect(call({ action: "addresses" }, false)).toEqual({ ok: false, error: "unauthorised" });
  });

  it("refuses the wrong secret", () => {
    expect(handle({ secret: "nope", action: "addresses" }, deps)).toEqual({ ok: false, error: "unauthorised" });
  });

  it("refuses everything when no secret has been configured, even an empty one", () => {
    for (const secret of [undefined, ""]) {
      expect(handle({ secret: "", action: "addresses" }, { ...deps, secret })).toEqual({ ok: false, error: "not configured" });
    }
  });

  it("does not leak data or reveal the secret in errors", () => {
    store.addresses.push({ uprn: "1", ons_code: "E06000022" });
    const reply = JSON.stringify(handle({ secret: "wrong", action: "addresses" }, deps));
    expect(reply).not.toContain("E06000022");
    expect(reply).not.toContain(SECRET);
  });

  it("rejects bodies that are not objects", () => {
    expect(handle(null, deps)).toEqual({ ok: false, error: "bad request" });
    expect(handle("addresses", deps)).toEqual({ ok: false, error: "bad request" });
  });

  it("compares secrets of different lengths as unequal", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
  });
});

describe("add_address and addresses", () => {
  it("adds an address and lists it with no last attempt", () => {
    expect(call({ action: "add_address", uprn: "100120000855", ons_code: "E06000022" })).toEqual({ ok: true });
    expect(call({ action: "addresses" })).toEqual({
      ok: true,
      addresses: [{ uprn: "100120000855", ons_code: "E06000022", last_attempt: null }],
    });
  });

  it("keeps postcode and house number when given", () => {
    call({ action: "add_address", uprn: "1", ons_code: "E06000022", postcode: "BA1 1AA", house_number: "5" });
    expect(store.addresses[0]).toEqual({ uprn: "1", ons_code: "E06000022", postcode: "BA1 1AA", house_number: "5" });
  });

  it("does not add the same address twice", () => {
    call({ action: "add_address", uprn: "1", ons_code: "E06000022" });
    call({ action: "add_address", uprn: "1", ons_code: "E06000022" });
    expect(store.addresses).toHaveLength(1);
  });

  it("rejects bad identifiers", () => {
    expect(call({ action: "add_address", uprn: "12 3", ons_code: "E06000022" })).toEqual({ ok: false, error: "bad uprn" });
    expect(call({ action: "add_address", uprn: "1", ons_code: "bad" })).toEqual({ ok: false, error: "bad ons_code" });
    expect(call({ action: "add_address", uprn: "1", ons_code: "E06000022", postcode: "x".repeat(50) })).toEqual({
      ok: false,
      error: "bad postcode",
    });
    expect(store.addresses).toHaveLength(0);
  });
});

describe("save_success", () => {
  it("stores collections with a fetched-at timestamp", () => {
    expect(call({ action: "save_success", uprn: "1", now: NOW, collections: COLLECTIONS })).toEqual({ ok: true });
    expect(store.results.get("1")).toEqual({
      uprn: "1",
      fetched_at: NOW,
      last_attempt: NOW,
      last_error: null,
      consecutive_failures: 0,
      collections: COLLECTIONS,
    });
  });

  it("shows the last attempt in the address list", () => {
    call({ action: "add_address", uprn: "1", ons_code: "E06000022" });
    call({ action: "save_success", uprn: "1", now: NOW, collections: COLLECTIONS });
    const reply = call({ action: "addresses" });
    expect(reply.ok && (reply.addresses as { last_attempt: string }[])[0].last_attempt).toBe(NOW);
  });

  it("rejects bad collections without writing anything", () => {
    for (const collections of [
      "no",
      [{ date: "30/10/2026", bin_name: "x", stream: "food" }],
      [{ date: "2026-10-30", bin_name: "x", stream: "glass" }],
      [{ date: "2026-10-30", stream: "food" }],
      [null],
    ]) {
      expect(call({ action: "save_success", uprn: "1", now: NOW, collections })).toEqual({ ok: false, error: "bad collections" });
    }
    expect(store.results.size).toBe(0);
  });

  it("rejects a bad timestamp", () => {
    expect(call({ action: "save_success", uprn: "1", now: "yesterday", collections: COLLECTIONS })).toEqual({
      ok: false,
      error: "bad timestamp",
    });
  });
});

describe("save_failure", () => {
  it("keeps the last good collections and counts failures", () => {
    call({ action: "save_success", uprn: "1", now: NOW, collections: COLLECTIONS });
    const later = "2026-11-02T22:11:12+00:00";
    call({ action: "save_failure", uprn: "1", now: later, error: "site down" });
    call({ action: "save_failure", uprn: "1", now: later, error: "site down" });
    expect(store.results.get("1")).toEqual({
      uprn: "1",
      fetched_at: NOW,
      last_attempt: later,
      last_error: "site down",
      consecutive_failures: 2,
      collections: COLLECTIONS,
    });
  });

  it("records a first failure with no collections", () => {
    call({ action: "save_failure", uprn: "1", now: NOW, error: "never worked" });
    expect(store.results.get("1")).toMatchObject({ fetched_at: null, consecutive_failures: 1, collections: [] });
  });

  it("a later success clears the failures", () => {
    call({ action: "save_failure", uprn: "1", now: NOW, error: "x" });
    call({ action: "save_success", uprn: "1", now: NOW, collections: COLLECTIONS });
    expect(store.results.get("1")).toMatchObject({ last_error: null, consecutive_failures: 0 });
  });

  it("rejects an over-long error", () => {
    expect(call({ action: "save_failure", uprn: "1", now: NOW, error: "x".repeat(501) })).toEqual({ ok: false, error: "bad error" });
  });
});

describe("locking", () => {
  it("runs writes inside the lock and reads outside it", () => {
    const events: string[] = [];
    deps.withLock = (work) => {
      events.push("lock");
      const value = work();
      events.push("unlock");
      return value;
    };
    call({ action: "add_address", uprn: "1", ons_code: "E06000022" });
    call({ action: "addresses" });
    expect(events).toEqual(["lock", "unlock"]);
  });
});

it("rejects unknown actions", () => {
  expect(call({ action: "drop_everything" })).toEqual({ ok: false, error: "unknown action" });
});
