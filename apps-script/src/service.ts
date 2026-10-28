/**
 * The fetcher's store API: a shared-secret protected set of actions over a pair of tables
 * (addresses and results). Pure logic, so it can be tested without Apps Script.
 */

import { daysBetween } from "./dates";
import { FEED_TOKEN, upcomingFor } from "./feed";

/** A feed nobody has asked for in this many days is deleted, with its address if it was the last feed on it. */
export const DEFAULT_FEED_LIFE_DAYS = 365;
const MIN_FEED_LIFE_DAYS = 30;
import { getCouncil } from "./registry";

export const STREAMS = ["general", "recycling", "food", "garden"] as const;

export interface AddressRow {
  uprn: string;
  ons_code: string;
  postcode?: string;
  house_number?: string;
}

export interface CollectionRow {
  date: string;
  bin_name: string;
  stream: string;
}

export interface ResultRow {
  uprn: string;
  fetched_at: string | null;
  last_attempt: string;
  last_error: string | null;
  consecutive_failures: number;
  collections: CollectionRow[];
}

export interface SubscriptionRow {
  /** The secret in the person's feed URL. */
  token: string;
  /** A short public id used in event UIDs. Not the token. */
  id: string;
  uprn: string;
  ons_code: string;
  garden: boolean;
  created_at: string;
  /** The last day (YYYY-MM-DD) the feed or its dates were asked for. Missing on older rows: the sign-up day counts. */
  last_used?: string;
}

export interface ChangeRow {
  at: string;
  uprn: string;
  ons_code: string;
  bin_name: string;
  kind: string;
  before: string | null;
  after: string | null;
  note: string;
}

export const CHANGE_KINDS = ["expected_shift", "round_change"] as const;

export interface Tables {
  addChanges(rows: ChangeRow[]): void;
  /** The most recent changes recorded for an address, newest last. */
  recentChanges(uprn: string): ChangeRow[];
  addresses(): AddressRow[];
  addAddress(row: AddressRow): void;
  getResult(uprn: string): ResultRow | null;
  putResult(row: ResultRow): void;
  countSubscriptions(uprn?: string): number;
  addSubscription(row: SubscriptionRow): void;
  findSubscription(token: string): SubscriptionRow | null;
  /** Every feed, for the yearly clear-out of unused ones. */
  subscriptions(): SubscriptionRow[];
  /** Records that the feed was used on this day (YYYY-MM-DD). Does nothing for an unknown token. */
  touchSubscription(token: string, today: string): void;
  /** True while an address row exists. A fetch that finishes after its address was deleted is dropped. */
  hasAddress(uprn: string): boolean;
  /** Removes one feed and returns the row it had, or null if there was none. */
  deleteSubscription(token: string): SubscriptionRow | null;
  /** Removes everything kept for an address: its row, its fetched dates and its recorded changes. */
  deleteAddress(uprn: string): void;
  /**
   * Adds one to a council's count; all we keep is the code, a count and two times. Does nothing for a new council
   * once `maxCouncils` different councils are already counted.
   */
  bumpWaitlist(onsCode: string, at: string, maxCouncils: number): void;
}

export interface Deps {
  /** The expected shared secret. Undefined means the service has not been configured. */
  secret: string | undefined;
  tables: Tables;
  /** Wraps writes so concurrent requests cannot interleave. */
  withLock?: <T>(work: () => T) => T;
  /** Random values for new subscriptions. */
  newToken?: () => string;
  newId?: () => string;
  nowIso?: () => string;
  /** The most subscriptions allowed in total, and for one address. */
  maxSubscriptions?: number;
  maxPerAddress?: number;
  /** The most different councils the waitlist will hold counts for. */
  maxWaitlistCouncils?: number;
  /** Today in Europe/London, YYYY-MM-DD. */
  todayIso?: () => string;
  /**
   * Asks for a fetch to run now, because a sign-up just added an address nobody has fetched yet. It must not carry the
   * address (the workflow it starts is public) and must never throw: a sign-up works whether or not this does.
   */
  requestFetch?: () => void;
}

export const DEFAULT_MAX_SUBSCRIPTIONS = 5000;
export const DEFAULT_MAX_PER_ADDRESS = 20;
// There are fewer than 400 councils in Great Britain and Northern Ireland, so this only stops junk codes piling up.
export const DEFAULT_MAX_WAITLIST_COUNCILS = 500;

export type Reply = { ok: true; [key: string]: unknown } | { ok: false; error: string };

const UPRN = /^[0-9]{1,12}$/;
/**
 * What the store keys an address by. A council that needs a UPRN uses the UPRN. A council that takes a postcode and a
 * house number has no UPRN, so it uses a key made from those (see addressKey). Both start with a digit or a letter,
 * so a key can never be read as a formula in the Sheet.
 */
const ADDRESS_ID = /^(?:[0-9]{1,12}|h-[ENSW][0-9]{8}-[A-Z0-9]{5,7}-[a-z0-9-]{1,40})$/;
const ONS_CODE = /^[ENSW][0-9]{8}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MAX_TEXT = 500;
// Postcodes and house numbers go into a Sheet, where a value starting with = + - or @ could run as a formula, so
// only plain characters are allowed, and never a leading symbol.
const POSTCODE = /^[A-Za-z0-9][A-Za-z0-9 ]{1,9}$/;
const HOUSE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ,'./-]{0,99}$/;

/**
 * The store key for an address with no UPRN: the council, the postcode with no space, and the house number or name in
 * lower case with anything that isn't a letter or digit turned into one dash. The same address typed two ways ("12 ",
 * "12") gets the same key, so it is fetched once however many people subscribe. Null if there is nothing usable.
 */
export function addressKey(onsCode: string, postcode: string, houseNumber: string): string | null {
  const compact = postcode.replace(/\s+/g, "").toUpperCase();
  const house = houseNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const key = `h-${onsCode}-${compact}-${house}`;
  return ADDRESS_ID.test(key) ? key : null;
}

function fail(error: string): Reply {
  return { ok: false, error };
}

/** Compares without stopping at the first difference. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function text(value: unknown, max = MAX_TEXT): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && DATE.test(value) ? value : undefined;
}

function validChanges(value: unknown, uprn: string, onsCode: string, at: string): ChangeRow[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const rows: ChangeRow[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { bin_name, kind, before, after, note } = item as Record<string, unknown>;
    const beforeDate = optionalDate(before);
    const afterDate = optionalDate(after);
    if (typeof bin_name !== "string" || bin_name.length > 200) return null;
    if (typeof kind !== "string" || !(CHANGE_KINDS as readonly string[]).includes(kind)) return null;
    if (beforeDate === undefined || afterDate === undefined) return null;
    if (typeof note !== "string" || note.length > 300) return null;
    rows.push({ at, uprn, ons_code: onsCode, bin_name, kind, before: beforeDate, after: afterDate, note });
  }
  return rows;
}

function validCollections(value: unknown): CollectionRow[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const rows: CollectionRow[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { date, bin_name, stream } = item as Record<string, unknown>;
    if (typeof date !== "string" || !DATE.test(date)) return null;
    if (text(bin_name, 200) === null || typeof bin_name !== "string") return null;
    if (typeof stream !== "string" || !(STREAMS as readonly string[]).includes(stream)) return null;
    rows.push({ date, bin_name, stream });
  }
  return rows;
}

/**
 * Public: anyone can ask for a feed for an address. Every request gets its own new token, so a feed URL is never
 * shared between people, and the address is added to the fetcher's list once however many people subscribe.
 */
function subscribe(request: Record<string, unknown>, deps: Deps): Reply {
  const { uprn, ons_code, postcode, house_number, garden } = request;
  if (typeof ons_code !== "string" || !ONS_CODE.test(ons_code)) return fail("bad ons_code");
  if (postcode !== undefined && !(typeof postcode === "string" && POSTCODE.test(postcode))) return fail("bad postcode");
  if (house_number !== undefined && !(typeof house_number === "string" && HOUSE_NUMBER.test(house_number))) return fail("bad house_number");
  if (garden !== undefined && typeof garden !== "boolean") return fail("bad garden");

  const council = getCouncil(ons_code);
  if (council?.status !== "supported") return fail("council not supported yet");
  for (const input of council.inputs ?? []) {
    if (input === "postcode" && typeof postcode !== "string") return fail("postcode needed");
    if (input === "house_number" && typeof house_number !== "string") return fail("house_number needed");
  }
  // A council that matches on the whole first line of the address can't use a bare number: it would find nothing, or
  // the wrong house. So the first line needs at least a number or name and a street.
  if (council.house_input === "first_line" && typeof house_number === "string" && house_number.trim().split(/[\s,]+/).filter(Boolean).length < 2) {
    return fail("first line needed");
  }
  // The key this address is stored under: its UPRN where the council needs one, otherwise one made from what was typed.
  let key: string;
  if ((council.inputs ?? []).includes("uprn")) {
    if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
    key = uprn;
  } else {
    const made = typeof postcode === "string" && typeof house_number === "string" ? addressKey(ons_code, postcode, house_number) : null;
    if (made === null) return fail("bad address");
    key = made;
  }
  if (!deps.newToken || !deps.newId) return fail("not configured");

  const withLock = deps.withLock ?? (<T>(work: () => T) => work());
  const { tables } = deps;
  let added = false;
  const reply = withLock(() => {
    if (tables.countSubscriptions() >= (deps.maxSubscriptions ?? DEFAULT_MAX_SUBSCRIPTIONS)) return fail("full");
    if (tables.countSubscriptions(key) >= (deps.maxPerAddress ?? DEFAULT_MAX_PER_ADDRESS)) return fail("too many feeds for this address");
    if (!tables.addresses().some((address) => address.uprn === key)) {
      const row: AddressRow = { uprn: key, ons_code };
      if (typeof postcode === "string") row.postcode = postcode;
      if (typeof house_number === "string") row.house_number = house_number;
      tables.addAddress(row);
      added = true;
    }
    const token = deps.newToken?.() as string;
    tables.addSubscription({
      token,
      id: deps.newId?.() as string,
      uprn: key,
      ons_code,
      garden: garden === true,
      created_at: deps.nowIso?.() ?? new Date().toISOString(),
    });
    return { ok: true, token } as Reply;
  });
  // A new address has no dates yet, so ask for a fetch now instead of waiting for the next daily run.
  if (added && reply.ok) {
    try {
      deps.requestFetch?.();
    } catch {
      // The sign-up already worked; the daily run will pick the address up.
    }
  }
  return reply;
}

/**
 * Public: the dates for a feed token, for the lookup page to show straight after sign-up. The token is the secret, the
 * same as for the calendar feed, and the answer is the same dates the feed shows.
 */
function upcoming(request: Record<string, unknown>, deps: Deps): Reply {
  const { token } = request;
  if (typeof token !== "string") return fail("bad token");
  const today = deps.todayIso?.() ?? new Date().toISOString().slice(0, 10);
  const found = upcomingFor(token, { tables: deps.tables, today });
  return found === null ? fail("not found") : { ok: true, ...found };
}

/**
 * Public: counts one person's interest in a council we don't cover yet. Only the council code is kept, so there is
 * nothing to leak and nothing to tell anyone later. The count shows which council to add next; it can't be proof
 * of demand, because anyone can send it.
 */
function joinWaitlist(request: Record<string, unknown>, deps: Deps): Reply {
  const { ons_code } = request;
  if (typeof ons_code !== "string" || !ONS_CODE.test(ons_code)) return fail("bad ons_code");
  const withLock = deps.withLock ?? (<T>(work: () => T) => work());
  const { tables } = deps;
  return withLock(() => {
    // The reply is the same either way, so the page can't be used to find out which councils are listed.
    tables.bumpWaitlist(ons_code, deps.nowIso?.() ?? new Date().toISOString(), deps.maxWaitlistCouncils ?? DEFAULT_MAX_WAITLIST_COUNCILS);
    return { ok: true } as Reply;
  });
}

/**
 * Public: deletes a feed for the person who holds its token (the token is the secret, the same as for the calendar feed
 * and the date lookup). The feed stops working at once. When it was the last feed for its address, the address, its
 * fetched dates and its recorded changes are deleted too, so nothing about the address is kept.
 */
function unsubscribe(request: Record<string, unknown>, deps: Deps): Reply {
  const { token } = request;
  if (typeof token !== "string" || !FEED_TOKEN.test(token)) return fail("bad token");
  const withLock = deps.withLock ?? (<T>(work: () => T) => work());
  const { tables } = deps;
  return withLock(() => {
    const removed = tables.deleteSubscription(token);
    if (removed === null) return fail("not found");
    if (tables.countSubscriptions(removed.uprn) === 0) tables.deleteAddress(removed.uprn);
    return { ok: true } as Reply;
  });
}

export function handle(body: unknown, deps: Deps): Reply {
  if (typeof body !== "object" || body === null) return fail("bad request");
  const request = body as Record<string, unknown>;

  if (request.action === "subscribe") return subscribe(request, deps);
  if (request.action === "join_waitlist") return joinWaitlist(request, deps);
  if (request.action === "upcoming") return upcoming(request, deps);
  if (request.action === "unsubscribe") return unsubscribe(request, deps);

  if (deps.secret === undefined || deps.secret === "") return fail("not configured");
  if (typeof request.secret !== "string" || !safeEqual(request.secret, deps.secret)) return fail("unauthorised");

  const withLock = deps.withLock ?? (<T>(work: () => T) => work());
  const { tables } = deps;

  switch (request.action) {
    case "addresses": {
      const addresses = tables.addresses().map((address) => ({
        ...address,
        last_attempt: tables.getResult(address.uprn)?.last_attempt ?? null,
      }));
      return { ok: true, addresses };
    }

    case "add_address": {
      const { uprn, ons_code, postcode, house_number } = request;
      if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
      if (typeof ons_code !== "string" || !ONS_CODE.test(ons_code)) return fail("bad ons_code");
      if (postcode !== undefined && !(typeof postcode === "string" && POSTCODE.test(postcode))) return fail("bad postcode");
      if (house_number !== undefined && !(typeof house_number === "string" && HOUSE_NUMBER.test(house_number))) return fail("bad house_number");
      const row: AddressRow = { uprn, ons_code };
      if (typeof postcode === "string") row.postcode = postcode;
      if (typeof house_number === "string") row.house_number = house_number;
      withLock(() => {
        if (!tables.addresses().some((a) => a.uprn === uprn)) tables.addAddress(row);
      });
      return { ok: true };
    }

    case "get_result": {
      const { uprn } = request;
      if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
      return { ok: true, result: tables.getResult(uprn) };
    }

    case "save_changes": {
      const { uprn, ons_code, now } = request;
      if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
      if (typeof ons_code !== "string" || !ONS_CODE.test(ons_code)) return fail("bad ons_code");
      if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
      const rows = validChanges(request.changes, uprn, ons_code, now);
      if (rows === null) return fail("bad changes");
      withLock(() => {
        if (tables.hasAddress(uprn)) tables.addChanges(rows); // dropped if the address was deleted while the fetch ran
      });
      return { ok: true };
    }

    case "save_success": {
      const { uprn, now } = request;
      const collections = validCollections(request.collections);
      if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
      if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
      if (collections === null) return fail("bad collections");
      withLock(() => {
        // A fetch that finishes after its address was deleted must not write the address back in through its dates.
        if (!tables.hasAddress(uprn)) return;
        tables.putResult({ uprn, fetched_at: now, last_attempt: now, last_error: null, consecutive_failures: 0, collections });
      });
      return { ok: true };
    }

    case "expire_feeds": {
      const days = request.days === undefined ? DEFAULT_FEED_LIFE_DAYS : request.days;
      if (typeof days !== "number" || !Number.isInteger(days) || days < MIN_FEED_LIFE_DAYS || days > 3650) return fail("bad days");
      const today = deps.todayIso?.() ?? new Date().toISOString().slice(0, 10);
      return withLock(() => {
        let expired = 0;
        let addresses = 0;
        for (const feed of tables.subscriptions()) {
          const lastUsed = feed.last_used ?? feed.created_at.slice(0, 10);
          if (daysBetween(lastUsed, today) <= days) continue;
          if (tables.deleteSubscription(feed.token) === null) continue;
          expired += 1;
          if (tables.countSubscriptions(feed.uprn) === 0) {
            tables.deleteAddress(feed.uprn);
            addresses += 1;
          }
        }
        return { ok: true, expired, addresses_deleted: addresses } as Reply;
      });
    }

    case "save_failure": {
      const { uprn, now } = request;
      const error = text(request.error);
      if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
      if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
      if (error === null) return fail("bad error");
      withLock(() => {
        if (!tables.hasAddress(uprn)) return;
        // Keep the last good collections and their fetched_at, so the feed can say it could not confirm.
        const previous = tables.getResult(uprn);
        tables.putResult({
          uprn,
          fetched_at: previous?.fetched_at ?? null,
          last_attempt: now,
          last_error: error,
          consecutive_failures: (previous?.consecutive_failures ?? 0) + 1,
          collections: previous?.collections ?? [],
        });
      });
      return { ok: true };
    }

    default:
      return fail("unknown action");
  }
}
