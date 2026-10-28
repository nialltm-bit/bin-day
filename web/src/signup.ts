/**
 * What the lookup page sends to the script, and how it reads the answer. The checks mirror the script's own, so a
 * mistake is caught before sending, but the script still checks everything again.
 */
import type { Outcome } from "./coverage";
import { feedLinksForToken } from "./poc-helpers";

/** What a person may type for the house. The script accepts the same characters and nothing that could be a formula. */
export const HOUSE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ,'./-]{0,99}$/;

export type Ask = "house_number" | "first_line";

export type HouseCheck = { ok: true; value: string } | { ok: false; error: string };

/** Trims and tidies what was typed, then checks it. A council that needs the first line needs at least two words. */
export function checkHouse(raw: string, ask: Ask): HouseCheck {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value === "") return { ok: false, error: ask === "first_line" ? "Enter the first line of your address." : "Enter your house number or name." };
  if (!HOUSE_NUMBER.test(value)) return { ok: false, error: "Use letters, numbers and ordinary punctuation only." };
  if (ask === "first_line" && value.split(/[\s,]+/).filter(Boolean).length < 2) {
    return { ok: false, error: "Enter the whole first line, for example 12 High Street. A number on its own isn't enough for this council." };
  }
  return { ok: true, value };
}

export type Ready = Extract<Outcome, { kind: "ready" }>;

export function subscribeBody(outcome: Ready, house: string, garden: boolean): Record<string, unknown> {
  return { action: "subscribe", ons_code: outcome.ons_code, postcode: outcome.postcode, house_number: house, garden };
}

export type Reply = { ok: true; token?: string } | { ok: false; error: string };

/** Posts to the script. Plain text, so the browser sends no pre-flight request the script can't answer. */
export async function post(scriptUrl: string, body: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<Reply> {
  try {
    const response = await fetchFn(scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    const reply = (await response.json()) as { ok?: unknown; token?: unknown; error?: unknown };
    if (reply.ok === true) return { ok: true, token: typeof reply.token === "string" ? reply.token : undefined };
    return { ok: false, error: typeof reply.error === "string" ? reply.error : "unknown" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Plain words for what the script can say no with. Anything unexpected gets the general answer. */
export function explain(error: string): string {
  switch (error) {
    case "network":
      return "We couldn't reach the service. Check your connection and try again.";
    case "first line needed":
      return "Enter the whole first line of your address, for example 12 High Street.";
    case "bad house_number":
    case "bad address":
      return "That address doesn't look right. Use letters, numbers and ordinary punctuation only.";
    case "bad postcode":
      return "That postcode doesn't look right.";
    case "council not supported yet":
      return "We can't show bin days for this council yet.";
    case "too many feeds for this address":
    case "full":
      return "We can't make a new calendar link right now. Please try again later.";
    default:
      return "Something went wrong on our side. Please try again in a minute.";
  }
}

export interface CalendarLinks {
  /** The private feed address itself, for copying. */
  https: string;
  google: string;
  apple: string;
  outlook: string;
}

/**
 * Where each calendar app's own "add by link" page lives. The Google and Outlook addresses are the apps' published
 * add-by-URL forms; they have not been tried against a live account yet.
 */
export function calendarLinks(scriptUrl: string, token: string): CalendarLinks | null {
  const feed = feedLinksForToken(scriptUrl, token);
  if (!feed) return null;
  return {
    https: feed.https,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.webcal)}`,
    apple: feed.webcal,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed.https)}&name=${encodeURIComponent("Bin Day")}`,
  };
}
