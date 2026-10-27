/** Builds one person's calendar feed from what the fetcher has stored. */
import { daysBetween, isoWeek } from "./dates";
import { type FeedEvent, buildCalendar } from "./ics";
import { type FeedCollection, type StoredCollection, projectCollections } from "./projection";
import { type Council, type Stream, bankHolidaysFor, getCouncil } from "./registry";
import type { ChangeRow, Tables } from "./service";
import { changeWarnings } from "./warnings";

/** A last good fetch older than this means we can't vouch for the dates (two missed weekly fetches). */
export const STALE_DAYS = 14;
/** Beyond this many days since the last good fetch (one weekly cycle and a day), the dates are flagged as unconfirmed. */
export const UNCONFIRMED_DAYS = 8;
export const ALARM_EVENING_BEFORE = "-PT6H"; // an all-day event starts at midnight, so 6 hours before is 6pm the day before

const STREAM_ORDER: Stream[] = ["general", "recycling", "food", "garden"];
const STREAM_NAME: Record<Stream, string> = { general: "rubbish", recycling: "recycling", food: "food", garden: "garden" };

export interface FeedInput {
  subscription: { id: string; garden: boolean };
  council: Council;
  collections: StoredCollection[];
  /** When the last good fetch happened, or null if there has never been one. */
  fetchedAt: string | null;
  now: Date;
  /** Today in Europe/London, YYYY-MM-DD. */
  today: string;
  holidays: string[] | undefined;
  /** Failed fetches in a row since the last good one. */
  consecutiveFailures?: number;
  /** The round changes the fetcher has recorded for this address. */
  changes?: ChangeRow[];
}

export const UNCONFIRMED_SUMMARY = "Couldn't confirm this week's collection, check the council site";
export const SETTING_UP_SUMMARY = "Bin Day is getting your collection dates, check back tomorrow";

function noticeEvent(id: string, kind: string, summary: string, today: string): FeedEvent {
  return { uid: `${id}-${kind}@bin-day`, summary, start: { kind: "date", date: today } };
}

function groupByDate(collections: FeedCollection[]): Map<string, FeedCollection[]> {
  const groups = new Map<string, FeedCollection[]>();
  for (const collection of collections) {
    groups.set(collection.date, [...(groups.get(collection.date) ?? []), collection]);
  }
  return groups;
}

function eventFor(id: string, date: string, ordinal: number, group: FeedCollection[]): FeedEvent {
  const streams = STREAM_ORDER.filter((stream) => group.some((c) => c.stream === stream));
  // Same order as the summary: rubbish, recycling, food, garden.
  const ordered = [...group].sort((a, b) => STREAM_ORDER.indexOf(a.stream) - STREAM_ORDER.indexOf(b.stream) || a.bin_name.localeCompare(b.bin_name));
  const labels = [...new Set(ordered.map((c) => c.label))];
  const projected = group.some((c) => !c.confirmed);
  const lines = [`Put out: ${labels.join(", ")}.`];
  if (projected) lines.push("Expected date, confirmed nearer the time.");
  return {
    // Keyed on the week, not the date, so a date that moves within its week updates the event instead of duplicating it.
    uid: `${id}-${isoWeek(date)}-${ordinal}@bin-day`,
    summary: `Bins: ${streams.map((s) => STREAM_NAME[s]).join(" + ")}`,
    description: lines.join("\n"),
    start: { kind: "date", date },
    alarm: ALARM_EVENING_BEFORE,
  };
}

export function buildFeed(input: FeedInput): string {
  const { subscription, council, collections, fetchedAt, now, today, holidays } = input;
  const id = subscription.id;
  const failures = input.consecutiveFailures ?? 0;
  const unconfirmedNotice = noticeEvent(id, "unconfirmed", UNCONFIRMED_SUMMARY, today);

  if (fetchedAt === null) {
    // Never fetched: either still waiting for the first fetch, or the first attempts have failed.
    const notice = failures > 0 ? unconfirmedNotice : noticeEvent(id, "setup", SETTING_UP_SUMMARY, today);
    return buildCalendar("Bin Day", [notice], now);
  }
  const age = daysBetween(fetchedAt.slice(0, 10), today);
  if (age > STALE_DAYS) {
    // Too old to vouch for: show no dates at all.
    return buildCalendar("Bin Day", [unconfirmedNotice], now);
  }

  const wanted = projectCollections({ collections, council, today, holidays }).filter(
    (collection) => subscription.garden || collection.stream !== "garden",
  );
  const events: FeedEvent[] = [];
  const ordinalsByWeek = new Map<string, number>();
  for (const [date, group] of [...groupByDate(wanted)].sort(([a], [b]) => a.localeCompare(b))) {
    const week = isoWeek(date);
    const ordinal = (ordinalsByWeek.get(week) ?? 0) + 1;
    ordinalsByWeek.set(week, ordinal);
    events.push(eventFor(id, date, ordinal, group));
  }
  events.push(...changeWarnings({ id, council, garden: subscription.garden, changes: input.changes ?? [], today }));
  // The last check failed or is overdue: keep the last good dates, but say so.
  if (failures > 0 || age > UNCONFIRMED_DAYS) events.push(unconfirmedNotice);
  events.sort((a, b) => a.start.date.localeCompare(b.start.date));
  // The calendar's timestamp is the fetch time, so it only changes when the stored dates are refreshed.
  return buildCalendar("Bin Day", events, new Date(fetchedAt));
}

export const FEED_TOKEN = /^[0-9a-f]{64}$/;

/** The calendar text for a feed token, or null if the token is malformed, unknown or for an unknown council. */
export function feedFor(token: string, deps: { tables: Tables; now: Date; today: string }): string | null {
  if (!FEED_TOKEN.test(token)) return null;
  const subscription = deps.tables.findSubscription(token);
  if (!subscription) return null;
  const council = getCouncil(subscription.ons_code);
  if (!council) return null;
  const result = deps.tables.getResult(subscription.uprn);
  return buildFeed({
    subscription: { id: subscription.id, garden: subscription.garden },
    council,
    collections: result?.collections ?? [],
    fetchedAt: result?.fetched_at ?? null,
    now: deps.now,
    today: deps.today,
    holidays: bankHolidaysFor(subscription.ons_code),
    consecutiveFailures: result?.consecutive_failures ?? 0,
    changes: deps.tables.recentChanges(subscription.uprn),
  });
}
