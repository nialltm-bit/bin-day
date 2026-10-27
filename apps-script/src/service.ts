/**
 * The fetcher's store API: a shared-secret protected set of actions over a pair of tables
 * (addresses and results). Pure logic, so it can be tested without Apps Script.
 */

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
}

export const DEFAULT_MAX_SUBSCRIPTIONS = 5000;
export const DEFAULT_MAX_PER_ADDRESS = 20;

export type Reply = { ok: true; [key: string]: unknown } | { ok: false; error: string };

const UPRN = /^[0-9]{1,12}$/;
const ONS_CODE = /^[ENSW][0-9]{8}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MAX_TEXT = 500;
// Postcodes and house numbers go into a Sheet, where a value starting with = + - or @ could run as a formula, so
// only plain characters are allowed, and never a leading symbol.
const POSTCODE = /^[A-Za-z0-9][A-Za-z0-9 ]{1,9}$/;
const HOUSE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ,'./-]{0,99}$/;

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
  if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
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
  if (!deps.newToken || !deps.newId) return fail("not configured");

  const withLock = deps.withLock ?? (<T>(work: () => T) => work());
  const { tables } = deps;
  return withLock(() => {
    if (tables.countSubscriptions() >= (deps.maxSubscriptions ?? DEFAULT_MAX_SUBSCRIPTIONS)) return fail("full");
    if (tables.countSubscriptions(uprn) >= (deps.maxPerAddress ?? DEFAULT_MAX_PER_ADDRESS)) return fail("too many feeds for this address");
    if (!tables.addresses().some((address) => address.uprn === uprn)) {
      const row: AddressRow = { uprn, ons_code };
      if (typeof postcode === "string") row.postcode = postcode;
      if (typeof house_number === "string") row.house_number = house_number;
      tables.addAddress(row);
    }
    const token = deps.newToken?.() as string;
    tables.addSubscription({
      token,
      id: deps.newId?.() as string,
      uprn,
      ons_code,
      garden: garden === true,
      created_at: deps.nowIso?.() ?? new Date().toISOString(),
    });
    return { ok: true, token } as Reply;
  });
}

export function handle(body: unknown, deps: Deps): Reply {
  if (typeof body !== "object" || body === null) return fail("bad request");
  const request = body as Record<string, unknown>;

  if (request.action === "subscribe") return subscribe(request, deps);

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
      if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
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
      if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
      return { ok: true, result: tables.getResult(uprn) };
    }

    case "save_changes": {
      const { uprn, ons_code, now } = request;
      if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
      if (typeof ons_code !== "string" || !ONS_CODE.test(ons_code)) return fail("bad ons_code");
      if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
      const rows = validChanges(request.changes, uprn, ons_code, now);
      if (rows === null) return fail("bad changes");
      withLock(() => tables.addChanges(rows));
      return { ok: true };
    }

    case "save_success": {
      const { uprn, now } = request;
      const collections = validCollections(request.collections);
      if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
      if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
      if (collections === null) return fail("bad collections");
      withLock(() =>
        tables.putResult({ uprn, fetched_at: now, last_attempt: now, last_error: null, consecutive_failures: 0, collections }),
      );
      return { ok: true };
    }

    case "save_failure": {
      const { uprn, now } = request;
      const error = text(request.error);
      if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
      if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
      if (error === null) return fail("bad error");
      withLock(() => {
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
