/**
 * The fetcher's store API: a shared-secret protected set of actions over a pair of tables
 * (addresses and results). Pure logic, so it can be tested without Apps Script.
 */

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

export interface Tables {
  addresses(): AddressRow[];
  addAddress(row: AddressRow): void;
  getResult(uprn: string): ResultRow | null;
  putResult(row: ResultRow): void;
}

export interface Deps {
  /** The expected shared secret. Undefined means the service has not been configured. */
  secret: string | undefined;
  tables: Tables;
  /** Wraps writes so concurrent requests cannot interleave. */
  withLock?: <T>(work: () => T) => T;
}

export type Reply = { ok: true; [key: string]: unknown } | { ok: false; error: string };

const UPRN = /^[0-9]{1,12}$/;
const ONS_CODE = /^[ENSW][0-9]{8}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MAX_TEXT = 500;

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

export function handle(body: unknown, deps: Deps): Reply {
  if (typeof body !== "object" || body === null) return fail("bad request");
  const request = body as Record<string, unknown>;

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
      if (postcode !== undefined && text(postcode, 10) === null) return fail("bad postcode");
      if (house_number !== undefined && text(house_number, 100) === null) return fail("bad house_number");
      const row: AddressRow = { uprn, ons_code };
      if (typeof postcode === "string") row.postcode = postcode;
      if (typeof house_number === "string") row.house_number = house_number;
      withLock(() => {
        if (!tables.addresses().some((a) => a.uprn === uprn)) tables.addAddress(row);
      });
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
