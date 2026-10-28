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
  beforeEach(() => {
    // A fetch only saves for an address that exists.
    for (const uprn of ["1", "100120000855"]) store.tables.addAddress({ uprn, ons_code: "E06000022" });
  });

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
  beforeEach(() => {
    // A fetch only saves for an address that exists.
    for (const uprn of ["1", "100120000855"]) store.tables.addAddress({ uprn, ons_code: "E06000022" });
  });

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

describe("get_result", () => {
  beforeEach(() => {
    // A fetch only saves for an address that exists.
    for (const uprn of ["1", "100120000855"]) store.tables.addAddress({ uprn, ons_code: "E06000022" });
  });

  it("gives the stored result so the fetcher can compare against it", () => {
    call({ action: "save_success", uprn: "1", now: NOW, collections: COLLECTIONS });
    const reply = call({ action: "get_result", uprn: "1" });
    expect(reply.ok && (reply.result as { collections: unknown }).collections).toEqual(COLLECTIONS);
  });

  it("gives null for an address with no result yet", () => {
    expect(call({ action: "get_result", uprn: "1" })).toEqual({ ok: true, result: null });
  });

  it("needs the secret and a sensible uprn", () => {
    expect(call({ action: "get_result", uprn: "1" }, false)).toEqual({ ok: false, error: "unauthorised" });
    expect(call({ action: "get_result", uprn: "x" })).toEqual({ ok: false, error: "bad uprn" });
  });
});

describe("save_changes", () => {
  beforeEach(() => {
    // A fetch only saves for an address that exists.
    for (const uprn of ["1", "100120000855"]) store.tables.addAddress({ uprn, ons_code: "E06000022" });
  });

  const change = { bin_name: "Food Recycling Collection Bin", kind: "round_change", before: "2026-11-06", after: "2026-11-09", note: "weekday changed" };
  const save = (changes: unknown, extra: Record<string, unknown> = {}) =>
    call({ action: "save_changes", uprn: "1", ons_code: "E06000022", now: NOW, changes, ...extra });

  it("logs each change with its address, council, time, before and after", () => {
    expect(save([change, { ...change, kind: "expected_shift", before: null, after: null }])).toEqual({ ok: true });
    expect(store.changes).toEqual([
      { at: NOW, uprn: "1", ons_code: "E06000022", ...change },
      { at: NOW, uprn: "1", ons_code: "E06000022", ...change, kind: "expected_shift", before: null, after: null },
    ]);
  });

  it("appends rather than replacing", () => {
    save([change]);
    save([change]);
    expect(store.changes).toHaveLength(2);
  });

  it("rejects bad changes without writing any of them", () => {
    for (const bad of [
      "no",
      [null],
      [{ ...change, kind: "mystery" }],
      [{ ...change, before: "06/11/2026" }],
      [{ ...change, after: undefined }],
      [{ ...change, note: "x".repeat(301) }],
      [{ ...change, bin_name: "x".repeat(201) }],
      [change, { ...change, kind: "mystery" }],
      Array.from({ length: 51 }, () => change),
    ]) {
      expect(save(bad)).toEqual({ ok: false, error: "bad changes" });
    }
    expect(store.changes).toHaveLength(0);
  });

  it("rejects a bad uprn, council or timestamp, and needs the secret", () => {
    expect(save([change], { uprn: "no" })).toEqual({ ok: false, error: "bad uprn" });
    expect(save([change], { ons_code: "no" })).toEqual({ ok: false, error: "bad ons_code" });
    expect(save([change], { now: "yesterday" })).toEqual({ ok: false, error: "bad timestamp" });
    expect(call({ action: "save_changes", uprn: "1", ons_code: "E06000022", now: NOW, changes: [change] }, false)).toEqual({
      ok: false,
      error: "unauthorised",
    });
  });
});

describe("join_waitlist (public)", () => {
  const join = (body: Record<string, unknown> = {}, d: Deps = { ...deps, nowIso: () => NOW }) =>
    handle({ action: "join_waitlist", ons_code: "E06000001", ...body }, d);

  it("needs no secret and counts one person for the council", () => {
    expect(join()).toEqual({ ok: true });
    expect(join()).toEqual({ ok: true });
    expect(store.waitlist.get("E06000001")).toEqual({ count: 2, first_at: NOW, last_at: NOW });
  });

  it("keeps only the council: a postcode, email or anything else sent along is dropped", () => {
    join({ postcode: "BA1 5AW", email: "a@b.co", house_number: "1", uprn: "100120000855" });
    expect(JSON.stringify([...store.waitlist])).not.toMatch(/BA1|a@b|100120000855/);
    expect(store.addresses).toEqual([]);
    expect(store.subscriptions).toEqual([]);
  });

  it("answers the same for a council we support and one we don't, so it can't be used to list what we cover", () => {
    expect(join({ ons_code: "E06000022" })).toEqual(join({ ons_code: "E06000001" }));
  });

  it("rejects codes that are not council codes", () => {
    for (const bad of ["", "nope", "E0600000", "e06000001", "=E06000001", 7, null]) {
      expect(join({ ons_code: bad }), String(bad)).toEqual({ ok: false, error: "bad ons_code" });
    }
    expect(store.waitlist.size).toBe(0);
  });

  it("stops adding new councils at the cap but keeps counting the ones it has", () => {
    const capped = { ...deps, nowIso: () => NOW, maxWaitlistCouncils: 2 };
    join({ ons_code: "E06000001" }, capped);
    join({ ons_code: "E06000002" }, capped);
    expect(join({ ons_code: "E06000003" }, capped)).toEqual({ ok: true });
    join({ ons_code: "E06000001" }, capped);
    expect([...store.waitlist.keys()]).toEqual(["E06000001", "E06000002"]);
    expect(store.waitlist.get("E06000001")?.count).toBe(2);
  });
});

describe("councils that take a postcode and house number (no UPRN)", () => {
  const NEWCASTLE = "E08000021";
  const publicDeps = (): Deps => ({ ...deps, newToken: () => "t".repeat(64), newId: () => "idid", nowIso: () => NOW });
  const subscribe = (body: Record<string, unknown> = {}, d: Deps = publicDeps()) =>
    handle({ action: "subscribe", ons_code: NEWCASTLE, postcode: "NE1 1AA", house_number: "12 High Street", ...body }, d);

  it("subscribes with no UPRN, and stores the address under a key made from what was typed", () => {
    expect(subscribe()).toEqual({ ok: true, token: "t".repeat(64) });
    expect(store.addresses).toEqual([{ uprn: "h-E08000021-NE11AA-12-high-street", ons_code: NEWCASTLE, postcode: "NE1 1AA", house_number: "12 High Street" }]);
    expect(store.subscriptions[0].uprn).toBe("h-E08000021-NE11AA-12-high-street");
  });

  it("gives the same key however the address is typed, so it is fetched once", () => {
    subscribe();
    subscribe({ postcode: "ne11aa", house_number: "12  HIGH street " });
    subscribe({ postcode: "NE1  1AA" });
    expect(store.addresses).toHaveLength(1);
    expect(store.subscriptions).toHaveLength(3);
  });

  it("keeps different houses apart, including names and flats", () => {
    subscribe({ house_number: "12 High Street" });
    subscribe({ house_number: "12A High Street" });
    subscribe({ house_number: "Flat 3, Rose House" });
    expect(store.addresses.map((a) => a.uprn)).toEqual([
      "h-E08000021-NE11AA-12-high-street",
      "h-E08000021-NE11AA-12a-high-street",
      "h-E08000021-NE11AA-flat-3-rose-house",
    ]);
  });

  it("ignores a UPRN sent along, because the council doesn't use one", () => {
    subscribe({ uprn: "100120000855" });
    expect(store.addresses[0].uprn).toBe("h-E08000021-NE11AA-12-high-street");
  });

  it("needs both a postcode and a house number", () => {
    expect(handle({ action: "subscribe", ons_code: NEWCASTLE, house_number: "12" }, publicDeps())).toEqual({ ok: false, error: "postcode needed" });
    expect(handle({ action: "subscribe", ons_code: NEWCASTLE, postcode: "NE1 1AA" }, publicDeps())).toEqual({ ok: false, error: "house_number needed" });
  });

  it("refuses a bare number, because this council's system needs the first line of the address", () => {
    for (const bare of ["12", "12A", "Rose", "12,"]) {
      expect(subscribe({ house_number: bare }), bare).toEqual({ ok: false, error: "first line needed" });
    }
    expect(store.addresses).toEqual([]);
  });

  it("refuses a postcode too short to be one, and a house number that starts with a symbol", () => {
    expect(subscribe({ postcode: "AB1" })).toEqual({ ok: false, error: "bad address" });
    expect(subscribe({ postcode: "." })).toEqual({ ok: false, error: "bad postcode" });
    expect(subscribe({ house_number: "..." })).toEqual({ ok: false, error: "bad house_number" });
    expect(store.addresses).toEqual([]);
  });

  it("makes keys that are safe in a Sheet and the same size whatever is typed", () => {
    expect(subscribe({ house_number: `12 ${"x".repeat(90)}` }).ok).toBe(true);
    for (const row of store.addresses) {
      expect(row.uprn).toMatch(/^h-[A-Za-z0-9-]+$/);
      expect(row.uprn.length).toBeLessThan(80);
    }
  });

  it("lets the fetcher list, save and read results under that key", () => {
    subscribe();
    const key = "h-E08000021-NE11AA-12-high-street";
    expect(call({ action: "addresses" })).toMatchObject({ ok: true, addresses: [{ uprn: key, postcode: "NE1 1AA", house_number: "12 High Street" }] });
    expect(call({ action: "save_success", uprn: key, now: NOW, collections: COLLECTIONS })).toEqual({ ok: true });
    expect(call({ action: "get_result", uprn: key })).toMatchObject({ ok: true, result: { uprn: key, consecutive_failures: 0 } });
  });

  it("still rejects ids that are neither a UPRN nor one of these keys", () => {
    for (const bad of ["h-E08000021-NE11AA-", "=1+1", "h-e08000021-NE11AA-12", "12 3", "h-E08000021-NE11AA-UPPER"]) {
      expect(call({ action: "get_result", uprn: bad }), bad).toEqual({ ok: false, error: "bad uprn" });
    }
  });

  it("leaves a UPRN council needing a UPRN", () => {
    expect(handle({ action: "subscribe", ons_code: "E06000022" }, publicDeps())).toEqual({ ok: false, error: "bad uprn" });
  });
});

describe("fetching at sign-up", () => {
  const publicDeps = (extra: Partial<Deps> = {}): Deps => ({ ...deps, newToken: () => "t".repeat(64), newId: () => "idid", nowIso: () => NOW, ...extra });
  const subscribe = (d: Deps, body: Record<string, unknown> = {}) => handle({ action: "subscribe", uprn: "100120000855", ons_code: "E06000022", ...body }, d);

  it("asks for a fetch when a sign-up adds an address nobody has fetched", () => {
    let calls = 0;
    expect(subscribe(publicDeps({ requestFetch: () => void calls++ })).ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("does not ask again for an address that is already there", () => {
    let calls = 0;
    const d = publicDeps({ requestFetch: () => void calls++ });
    subscribe(d);
    subscribe(d);
    subscribe(d);
    expect(calls).toBe(1);
  });

  it("does not ask when the sign-up is refused", () => {
    let calls = 0;
    const d = publicDeps({ requestFetch: () => void calls++ });
    expect(subscribe(d, { uprn: "nope" }).ok).toBe(false);
    expect(handle({ action: "subscribe", ons_code: "E06000023", uprn: "1" }, d).ok).toBe(false);
    expect(subscribe({ ...d, maxSubscriptions: 0 }).ok).toBe(false);
    expect(calls).toBe(0);
  });

  it("still signs the person up if asking for a fetch fails", () => {
    const d = publicDeps({
      requestFetch: () => {
        throw new Error("GitHub is down");
      },
    });
    expect(subscribe(d)).toEqual({ ok: true, token: "t".repeat(64) });
    expect(store.subscriptions).toHaveLength(1);
  });

  it("works with no way to ask for a fetch", () => {
    expect(subscribe(publicDeps()).ok).toBe(true);
  });
});

describe("upcoming (public)", () => {
  const publicDeps = (): Deps => ({ ...deps, newToken: () => "e".repeat(64), newId: () => "idid", nowIso: () => NOW, todayIso: () => "2026-10-27" });

  it("is pending after sign-up, then shows the dates once the fetcher has saved them, with no secret", () => {
    const d = publicDeps();
    handle({ action: "subscribe", uprn: "100120000855", ons_code: "E06000022" }, d);
    expect(handle({ action: "upcoming", token: "e".repeat(64) }, d)).toEqual({ ok: true, status: "pending", collections: [] });
    handle({ secret: SECRET, action: "save_success", uprn: "100120000855", now: "2026-10-27T05:17:00+00:00", collections: COLLECTIONS }, d);
    const reply = handle({ action: "upcoming", token: "e".repeat(64) }, d);
    expect(reply).toMatchObject({ ok: true, status: "ready" });
    expect((reply as unknown as { collections: { date: string; label: string }[] }).collections[0]).toMatchObject({ date: "2026-10-30", label: "rubbish + food" });
  });

  it("says not found for an unknown token and rejects a missing or non-text one", () => {
    const d = publicDeps();
    expect(handle({ action: "upcoming", token: "f".repeat(64) }, d)).toEqual({ ok: false, error: "not found" });
    expect(handle({ action: "upcoming" }, d)).toEqual({ ok: false, error: "bad token" });
    expect(handle({ action: "upcoming", token: 5 }, d)).toEqual({ ok: false, error: "bad token" });
  });
});

describe("unsubscribe (public)", () => {
  const TOKEN_A = "a".repeat(63) + "1";
  const TOKEN_B = "b".repeat(64);
  const publicDeps = (token: string): Deps => ({ secret: SECRET, tables: store.tables, newToken: () => token, newId: () => "00000001", nowIso: () => NOW });
  const signUp = (token: string, extra: Record<string, unknown> = {}) =>
    handle({ action: "subscribe", uprn: "100120000855", ons_code: "E06000022", ...extra }, publicDeps(token));
  const unsubscribe = (token: unknown) => handle({ action: "unsubscribe", token }, deps);

  it("needs no secret, and removes the feed, the address, its dates and its recorded changes", () => {
    signUp(TOKEN_A);
    store.tables.putResult({ uprn: "100120000855", fetched_at: NOW, last_attempt: NOW, last_error: null, consecutive_failures: 0, collections: COLLECTIONS });
    store.tables.addChanges([{ at: NOW, uprn: "100120000855", ons_code: "E06000022", bin_name: "x", kind: "round_change", before: null, after: null, note: "n" }]);
    expect(unsubscribe(TOKEN_A)).toEqual({ ok: true });
    expect(store.subscriptions).toEqual([]);
    expect(store.addresses).toEqual([]);
    expect(store.results.size).toBe(0);
    expect(store.changes).toEqual([]);
  });

  it("keeps the address for the other feeds on it until the last one is deleted", () => {
    signUp(TOKEN_A);
    signUp(TOKEN_B);
    expect(unsubscribe(TOKEN_A)).toEqual({ ok: true });
    expect(store.subscriptions.map((s) => s.token)).toEqual([TOKEN_B]);
    expect(store.addresses).toHaveLength(1);
    expect(unsubscribe(TOKEN_B)).toEqual({ ok: true });
    expect(store.addresses).toEqual([]);
  });

  it("stops the feed and the date lookup working once the token is deleted", () => {
    signUp(TOKEN_A);
    unsubscribe(TOKEN_A);
    expect(handle({ action: "upcoming", token: TOKEN_A }, deps)).toEqual({ ok: false, error: "not found" });
  });

  it("deletes the postcode and house number kept for a council with no UPRN", () => {
    signUp(TOKEN_A, { uprn: undefined, ons_code: "E08000021", postcode: "NE3 4XE", house_number: "1 Northumberland Avenue" });
    expect(store.addresses[0]?.postcode).toBe("NE3 4XE");
    unsubscribe(TOKEN_A);
    expect(store.addresses).toEqual([]);
  });

  it("says no to a token that is unknown, malformed or missing, without touching anything", () => {
    signUp(TOKEN_A);
    expect(unsubscribe(TOKEN_B)).toEqual({ ok: false, error: "not found" });
    expect(unsubscribe("short")).toEqual({ ok: false, error: "bad token" });
    expect(unsubscribe(undefined)).toEqual({ ok: false, error: "bad token" });
    expect(store.subscriptions).toHaveLength(1);
  });
});

describe("a fetch that finishes after its address was deleted", () => {
  const TOKEN = "c".repeat(64);
  const signUp = () =>
    handle({ action: "subscribe", uprn: "100120000855", ons_code: "E06000022" }, { secret: SECRET, tables: store.tables, newToken: () => TOKEN, newId: () => "00000001", nowIso: () => NOW });

  it("writes nothing back: not its dates, not a failure, not recorded changes", () => {
    signUp();
    handle({ action: "unsubscribe", token: TOKEN }, deps);
    expect(call({ action: "save_success", uprn: "100120000855", now: NOW, collections: COLLECTIONS })).toEqual({ ok: true });
    expect(call({ action: "save_failure", uprn: "100120000855", now: NOW, error: "boom" })).toEqual({ ok: true });
    expect(call({ action: "save_changes", uprn: "100120000855", ons_code: "E06000022", now: NOW, changes: [{ bin_name: "x", kind: "round_change", before: null, after: null, note: "n" }] })).toEqual({ ok: true });
    expect(store.results.size).toBe(0);
    expect(store.changes).toEqual([]);
  });

  it("still saves for an address that exists", () => {
    signUp();
    call({ action: "save_success", uprn: "100120000855", now: NOW, collections: COLLECTIONS });
    expect(store.results.get("100120000855")?.collections).toHaveLength(2);
  });
});

describe("expire_feeds", () => {
  const today = "2026-10-28";
  const withToday: Deps = { secret: SECRET, tables: undefined as never, todayIso: () => today };
  const run = (extra: Record<string, unknown> = {}) => handle({ secret: SECRET, action: "expire_feeds", ...extra }, { ...withToday, tables: store.tables });
  const feed = (token: string, uprn: string, lastUsed: string | undefined, created = "2024-01-01T10:00:00+00:00") => {
    store.tables.addSubscription({ token, id: token.slice(0, 8), uprn, ons_code: "E06000022", garden: false, created_at: created, ...(lastUsed ? { last_used: lastUsed } : {}) });
    if (!store.addresses.some((a) => a.uprn === uprn)) store.tables.addAddress({ uprn, ons_code: "E06000022" });
    store.tables.putResult({ uprn, fetched_at: NOW, last_attempt: NOW, last_error: null, consecutive_failures: 0, collections: COLLECTIONS });
  };

  it("needs the secret", () => {
    expect(handle({ action: "expire_feeds" }, { ...withToday, tables: store.tables })).toEqual({ ok: false, error: "unauthorised" });
  });

  it("deletes a feed unused for more than a year, with its address, dates and changes", () => {
    feed("a".repeat(64), "100000000001", "2025-10-01");
    expect(run()).toEqual({ ok: true, expired: 1, addresses_deleted: 1 });
    expect(store.subscriptions).toEqual([]);
    expect(store.addresses).toEqual([]);
    expect(store.results.size).toBe(0);
  });

  it("keeps a feed used within the year, on the last day of it", () => {
    feed("b".repeat(64), "100000000002", "2025-10-28");
    feed("c".repeat(64), "100000000003", "2026-10-27");
    expect(run()).toEqual({ ok: true, expired: 0, addresses_deleted: 0 });
    expect(store.subscriptions).toHaveLength(2);
  });

  it("counts the sign-up day for a feed with no last-used day yet", () => {
    feed("d".repeat(64), "100000000004", undefined, "2025-11-20T10:00:00+00:00");
    feed("e".repeat(64), "100000000005", undefined, "2025-09-01T10:00:00+00:00");
    expect(run()).toEqual({ ok: true, expired: 1, addresses_deleted: 1 });
    expect(store.subscriptions.map((s) => s.token)).toEqual(["d".repeat(64)]);
  });

  it("keeps an address while a used feed still points at it", () => {
    feed("f".repeat(64), "100000000006", "2025-01-01");
    store.tables.addSubscription({ token: "9".repeat(64), id: "99999999", uprn: "100000000006", ons_code: "E06000022", garden: false, created_at: NOW, last_used: "2026-10-01" });
    expect(run()).toEqual({ ok: true, expired: 1, addresses_deleted: 0 });
    expect(store.addresses).toHaveLength(1);
    expect(store.results.size).toBe(1);
  });

  it("takes a shorter or longer life, within limits", () => {
    feed("a".repeat(64), "100000000007", "2026-06-01");
    expect(run({ days: 365 })).toEqual({ ok: true, expired: 0, addresses_deleted: 0 });
    expect(run({ days: 100 })).toEqual({ ok: true, expired: 1, addresses_deleted: 1 });
    expect(run({ days: 5 })).toEqual({ ok: false, error: "bad days" });
    expect(run({ days: "365" })).toEqual({ ok: false, error: "bad days" });
  });
});

describe("using a feed", () => {
  it("is recorded when the date lookup is asked for, once a day", () => {
    const token = "a".repeat(64);
    store.tables.addSubscription({ token, id: "00000001", uprn: "100120000855", ons_code: "E06000022", garden: false, created_at: NOW });
    handle({ action: "upcoming", token }, { ...deps, todayIso: () => "2026-11-02" });
    expect(store.subscriptions[0]?.last_used).toBe("2026-11-02");
  });
});
