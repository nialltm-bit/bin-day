import { beforeEach, describe, expect, it } from "vitest";
import { type Deps, handle, safeEqual } from "./service";
import { memoryTables } from "./test-tables";

const SECRET = "s3cret-value";
const NOW = "2026-10-26T22:11:12+00:00";
const COLLECTIONS = [
  { date: "2026-10-30", bin_name: "Food Recycling Collection Bin", stream: "food" },
  { date: "2026-10-30", bin_name: "Black Rubbish Bin (140L)", stream: "general" },
];

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

describe("subscribe (public)", () => {
  let counter = 0;
  const publicDeps = (): Deps => ({
    secret: SECRET,
    tables: store.tables,
    newToken: () => String(++counter).padStart(64, "a"),
    newId: () => String(counter).padStart(8, "0"),
    nowIso: () => NOW,
  });
  const subscribe = (body: Record<string, unknown> = {}, d: Deps = publicDeps()) =>
    handle({ action: "subscribe", uprn: "100120000855", ons_code: "E06000022", ...body }, d);

  beforeEach(() => {
    counter = 0;
  });

  it("needs no secret, and gives back a new token", () => {
    expect(subscribe()).toEqual({ ok: true, token: "a".repeat(63) + "1" });
    expect(store.subscriptions).toEqual([
      { token: "a".repeat(63) + "1", id: "00000001", uprn: "100120000855", ons_code: "E06000022", garden: false, created_at: NOW },
    ]);
  });

  it("adds the address for the fetcher, once, however many people subscribe", () => {
    subscribe();
    subscribe();
    expect(store.addresses).toEqual([{ uprn: "100120000855", ons_code: "E06000022" }]);
    expect(store.subscriptions).toHaveLength(2);
  });

  it("gives each subscription its own token", () => {
    const first = subscribe();
    const second = subscribe();
    expect(first.ok && second.ok && first.token !== second.token).toBe(true);
  });

  it("records the garden preference", () => {
    subscribe({ garden: true });
    expect(store.subscriptions[0].garden).toBe(true);
  });

  it("refuses councils that are not supported yet", () => {
    expect(subscribe({ ons_code: "E06000023" })).toEqual({ ok: false, error: "council not supported yet" });
    expect(store.subscriptions).toHaveLength(0);
    expect(store.addresses).toHaveLength(0);
  });

  it("rejects bad input without writing anything", () => {
    expect(subscribe({ uprn: "12 3" })).toEqual({ ok: false, error: "bad uprn" });
    expect(subscribe({ ons_code: "nope" })).toEqual({ ok: false, error: "bad ons_code" });
    expect(subscribe({ garden: "yes" })).toEqual({ ok: false, error: "bad garden" });
    expect(subscribe({ postcode: "x".repeat(40) })).toEqual({ ok: false, error: "bad postcode" });
    expect(store.subscriptions).toHaveLength(0);
    expect(store.addresses).toHaveLength(0);
  });

  it("only lets plain characters into postcode and house number, so nothing can run as a formula in the Sheet", () => {
    for (const bad of ["=IMPORTXML(A1)", "+1", "-1", "@SUM(A1)", " x", "x\n=1", "<b>", "x".repeat(101)]) {
      expect(subscribe({ house_number: bad })).toEqual({ ok: false, error: "bad house_number" });
    }
    for (const bad of ["=1+1", "@x", "B1 1AA;", "x".repeat(11)]) {
      expect(subscribe({ postcode: bad })).toEqual({ ok: false, error: "bad postcode" });
    }
    expect(subscribe({ postcode: "BA1 1AA", house_number: "Flat 2, 14-16 High St." }).ok).toBe(true);
    expect(store.subscriptions).toHaveLength(1);
  });

  it("stops at the limits", () => {
    expect(subscribe({}, { ...publicDeps(), maxPerAddress: 2 }).ok).toBe(true);
    expect(subscribe({}, { ...publicDeps(), maxPerAddress: 2 }).ok).toBe(true);
    expect(subscribe({}, { ...publicDeps(), maxPerAddress: 2 })).toEqual({ ok: false, error: "too many feeds for this address" });
    expect(subscribe({ uprn: "1" }, { ...publicDeps(), maxSubscriptions: 2 })).toEqual({ ok: false, error: "full" });
  });

  it("is not configured without a way to make tokens", () => {
    expect(subscribe({}, { secret: SECRET, tables: store.tables })).toEqual({ ok: false, error: "not configured" });
  });

  it("does not open up the secret-protected actions", () => {
    expect(handle({ action: "addresses" }, publicDeps())).toEqual({ ok: false, error: "unauthorised" });
    expect(handle({ action: "save_success", uprn: "1", now: NOW, collections: [] }, publicDeps())).toEqual({ ok: false, error: "unauthorised" });
  });

  it("locks while writing", () => {
    const events: string[] = [];
    subscribe({}, {
      ...publicDeps(),
      withLock: (work) => {
        events.push("lock");
        const value = work();
        events.push("unlock");
        return value;
      },
    });
    expect(events).toEqual(["lock", "unlock"]);
  });
});
