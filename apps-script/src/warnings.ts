/**
 * The "bin days change" warning in the feed. People put bins out on habit, so a quietly moved calendar event is easy
 * to miss. When the fetcher records a round change for an address, the feed carries an all-day warning event about a
 * week before the change, with an alarm like every other event. Expected holiday shifts never produce one.
 */
import { addDays, daysBetween, weekdayIndex } from "./dates";
import type { FeedEvent } from "./ics";
import type { Council } from "./registry";
import type { ChangeRow } from "./service";

/** A change is shown for this long after it was found. */
export const WARNING_LOOKBACK_DAYS = 28;
/** How far before the change the warning appears. */
export const WARNING_LEAD_DAYS = 7;
/**
 * 9am on the warning's own day. The usual evening-before alarm would often be in the past: a warning dated the day the
 * change was found starts at midnight, so its evening-before alarm would be before the fetch that found the change.
 */
const WARNING_ALARM = "PT9H";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function dayName(date: string): string {
  return DAYS[weekdayIndex(date)];
}

export function longDate(date: string): string {
  return `${dayName(date)} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

function describe(change: ChangeRow, label: string): string {
  if (change.before && change.after) return `${label}: ${longDate(change.after)} instead of ${longDate(change.before)}.`;
  if (change.after) return `${label}: a new collection on ${longDate(change.after)}.`;
  return `${label}: the collection on ${longDate(change.before as string)} is no longer listed.`;
}

function when(eventDate: string, firstChange: string): string {
  const weeks = (daysBetween(addDays(eventDate, -weekdayIndex(eventDate)), addDays(firstChange, -weekdayIndex(firstChange)))) / 7;
  if (weeks <= 0) return "this week";
  if (weeks === 1) return "next week";
  return `from ${longDate(firstChange)}`;
}

export function changeWarnings(input: { id: string; council: Council; garden: boolean; changes: ChangeRow[]; today: string }): FeedEvent[] {
  const { id, council, garden, changes, today } = input;
  const binTypes = council.bin_types ?? {};
  const byDay = new Map<string, ChangeRow[]>();

  for (const change of changes) {
    if (change.kind !== "round_change") continue; // expected holiday shifts are silent
    if (!garden && binTypes[change.bin_name]?.stream === "garden") continue;
    const found = change.at.slice(0, 10);
    if (daysBetween(found, today) > WARNING_LOOKBACK_DAYS) continue;
    byDay.set(found, [...(byDay.get(found) ?? []), change]);
  }

  const events: FeedEvent[] = [];
  for (const [found, group] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const targets = group.map((c) => c.after ?? (c.before as string));
    const first = [...targets].sort()[0];
    if (daysBetween(first, today) > WARNING_LEAD_DAYS) continue; // the change is well in the past
    // About a week before the change, but never before it was found.
    const date = [addDays(first, -WARNING_LEAD_DAYS), found].sort().at(-1) as string;

    const weekdays = new Set(group.map((c) => (c.after ? dayName(c.after) : "")));
    const weekdayMoved = group.every((c) => c.before && c.after && weekdayIndex(c.before) !== weekdayIndex(c.after));
    const now = weekdayMoved && weekdays.size === 1 ? `, now ${[...weekdays][0]}s` : "";

    events.push({
      uid: `${id}-change-${found}@bin-day`,
      summary: `Bin days change ${when(date, first)}${now}`,
      description: group.map((c) => describe(c, binTypes[c.bin_name]?.label ?? c.bin_name)).join("\n"),
      start: { kind: "date", date },
      alarm: WARNING_ALARM,
    });
  }
  return events;
}
