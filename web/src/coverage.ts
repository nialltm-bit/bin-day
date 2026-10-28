/**
 * What to do with a postcode: work out the council, then say honestly whether we can show bin days for it.
 *
 * We only ever show bin days when the council is supported and we can find the address from what the person types
 * (a house number or name). Everything else ends in a clear message and a way to find the answer elsewhere. We never
 * guess a neighbouring council, and we never ask for an email address.
 */

export interface CouncilEntry {
  ons_code: string;
  name: string;
  status: "supported" | "unsupported" | "broken";
  inputs?: string[];
}

export type Outcome =
  /** Not a UK postcode shape. */
  | { kind: "bad_postcode" }
  /** The postcode has the right shape but does not exist. */
  | { kind: "postcode_not_found"; postcode: string }
  /** Our postcode service could not be reached or gave an answer we can't use. Nothing is known about the council. */
  | { kind: "lookup_failed" }
  /** Channel Islands and the Isle of Man are not UK councils. */
  | { kind: "outside_coverage"; postcode: string }
  /** The postcode exists but the service did not say which council collects there. */
  | { kind: "council_unknown"; postcode: string }
  /** We have no source for this council yet. */
  | { kind: "council_not_covered"; postcode: string; ons_code: string; name: string }
  /** We have a source, but it needs a UPRN and we have no free way to find one from an address. */
  | { kind: "council_needs_address_lookup"; postcode: string; ons_code: string; name: string }
  /** We have a source for this council, but it is failing at the moment. */
  | { kind: "council_unavailable"; postcode: string; ons_code: string; name: string }
  /**
   * Ready. `house_number`: ask for a house number or name and let the council's own system match it.
   * `address_list`: the council needs a UPRN and we have a finder, so show the addresses to pick from.
   */
  | { kind: "ready"; postcode: string; ons_code: string; name: string; ask: "house_number" | "address_list" };

export interface Message {
  headline: string;
  detail: string;
  /** Offer to count this person's interest for this council (council only, no postcode, no email). */
  waitlist?: { ons_code: string };
  /** A place to find the answer elsewhere. */
  help?: { label: string; url: string };
}

export const FIND_COUNCIL_URL = "https://www.gov.uk/find-local-council";
const POSTCODES_IO = "https://api.postcodes.io/postcodes/";
const TIMEOUT_MS = 8000;
const MAX_NAME = 80;

/** "ba1  5aw" becomes "BA1 5AW". Returns null if it isn't shaped like a UK postcode. */
export function normalisePostcode(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/** We can only ask a person for a house number or name. A source that needs a UPRN has no way to get one yet. */
export function canAskForHouseNumber(council: CouncilEntry): boolean {
  const inputs = council.inputs ?? [];
  return inputs.includes("house_number") && !inputs.includes("uprn");
}

export function classifyCouncil(postcode: string, onsCode: string, name: string, councils: CouncilEntry[], canFindUprn = false): Outcome {
  const council = councils.find((c) => c.ons_code === onsCode);
  if (!council || council.status === "unsupported") return { kind: "council_not_covered", postcode, ons_code: onsCode, name: council?.name ?? name };
  if (council.status === "broken") return { kind: "council_unavailable", postcode, ons_code: onsCode, name: council.name };
  if (canAskForHouseNumber(council)) return { kind: "ready", postcode, ons_code: onsCode, name: council.name, ask: "house_number" };
  // A UPRN source is only offered once something can find the UPRN. Today nothing free can, so this stays false.
  if (canFindUprn && (council.inputs ?? []).includes("uprn")) return { kind: "ready", postcode, ons_code: onsCode, name: council.name, ask: "address_list" };
  return { kind: "council_needs_address_lookup", postcode, ons_code: onsCode, name: council.name };
}

export interface LookupDeps {
  fetch: typeof fetch;
  councils: CouncilEntry[];
  /** True once an address finder that returns UPRNs is wired in. Councils that need a UPRN are offered only then. */
  canFindUprn?: boolean;
}

function cleanName(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, MAX_NAME) : "your council";
}

export async function lookup(rawPostcode: string, deps: LookupDeps): Promise<Outcome> {
  const postcode = normalisePostcode(rawPostcode);
  if (postcode === null) return { kind: "bad_postcode" };

  let response: Response;
  try {
    response = await deps.fetch(POSTCODES_IO + encodeURIComponent(postcode), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { kind: "lookup_failed" };
  }
  if (response.status === 404) return { kind: "postcode_not_found", postcode };
  if (!response.ok) return { kind: "lookup_failed" };

  let result: Record<string, unknown>;
  try {
    const body = (await response.json()) as { result?: unknown };
    if (typeof body.result !== "object" || body.result === null) return { kind: "lookup_failed" };
    result = body.result as Record<string, unknown>;
  } catch {
    return { kind: "lookup_failed" };
  }

  if (result.country === "Channel Islands" || result.country === "Isle of Man") return { kind: "outside_coverage", postcode };
  const codes = result.codes as Record<string, unknown> | undefined;
  const onsCode = codes?.admin_district;
  if (typeof onsCode !== "string" || !/^[ENSW][0-9]{8}$/.test(onsCode)) return { kind: "council_unknown", postcode };
  return classifyCouncil(postcode, onsCode, cleanName(result.admin_district), deps.councils, deps.canFindUprn === true);
}

const find = { label: "Find your council's own bin day page", url: FIND_COUNCIL_URL };

/** The words to show. None of them promises to tell anyone anything later, because we hold no contact details. */
export function messageFor(outcome: Outcome): Message {
  switch (outcome.kind) {
    case "bad_postcode":
      return { headline: "That doesn't look like a UK postcode", detail: "Check it and try again. For example: BA1 5AW." };
    case "postcode_not_found":
      return {
        headline: "We can't find that postcode",
        detail: "Check it for typos. Very new postcodes may not be listed yet.",
      };
    case "lookup_failed":
      return { headline: "Something went wrong looking that up", detail: "Nothing is wrong with your postcode. Please try again in a minute." };
    case "outside_coverage":
      return { headline: "We only cover councils in Great Britain and Northern Ireland", detail: "Your council's own website will have your bin days.", help: find };
    case "council_unknown":
      return {
        headline: "We couldn't work out which council collects your bins",
        detail: "Postcodes on a council boundary can be hard to place. Your council's own website will have your bin days.",
        help: find,
      };
    case "council_not_covered":
      return {
        headline: `We don't cover ${outcome.name} yet`,
        detail:
          "We're adding councils one at a time. We don't keep email addresses, so we can't tell you when it's added, but you can add your council to the count below. It helps us choose which to add next.",
        waitlist: { ons_code: outcome.ons_code },
        help: find,
      };
    case "council_needs_address_lookup":
      return {
        headline: `We can't find addresses in ${outcome.name} yet`,
        detail:
          "We know how to get bin days from this council, but we can't yet match your address to its records. We don't keep email addresses, so we can't tell you when this changes, but you can add your council to the count below.",
        waitlist: { ons_code: outcome.ons_code },
        help: find,
      };
    case "council_unavailable":
      return {
        headline: `${outcome.name}'s bin day data isn't working right now`,
        detail: "We know about it. Please try again later, or see your council's own website.",
        help: find,
      };
    case "ready":
      return {
        headline: `Your council is ${outcome.name}`,
        detail: outcome.ask === "address_list" ? "Pick your address." : "Enter your house number or name.",
      };
  }
}
