/**
 * Works out which collections to show. Some councils (B&NES) return only the next date for each bin. For those we
 * keep the confirmed date and project each bin forward by its `every_weeks`, up to eight weeks ahead, but never into a
 * bank holiday week or the Christmas and New Year period: those dates appear only once the council confirms them.
 */
import { addDays, mondayOf } from "./dates";
import type { Council, Stream } from "./registry";

export const HORIZON_DAYS = 56;
/** The weeks overlapping 22 December to 13 January are treated as Christmas and New Year (councils revise dates through mid-January). */
export const CHRISTMAS_START = "12-22";
export const CHRISTMAS_END = "01-13";

export interface StoredCollection {
  date: string;
  bin_name: string;
  stream: string;
}

export interface FeedCollection {
  date: string;
  bin_name: string;
  stream: Stream;
  label: string;
  /** True when the council gave this date; false when we projected it. */
  confirmed: boolean;
}

function overlapsChristmas(weekStart: string, weekEnd: string): boolean {
  const year = Number(weekStart.slice(0, 4));
  for (const y of [year - 1, year]) {
    const start = `${y}-${CHRISTMAS_START}`;
    const end = `${y + 1}-${CHRISTMAS_END}`;
    if (weekStart <= end && weekEnd >= start) return true;
  }
  return false;
}

/** True if the Monday-to-Sunday week containing `date` has a bank holiday or overlaps Christmas and New Year. */
export function inHolidayWeek(date: string, holidays: string[]): boolean {
  const start = mondayOf(date);
  const end = addDays(start, 6);
  return holidays.some((holiday) => holiday >= start && holiday <= end) || overlapsChristmas(start, end);
}

export function projectCollections(input: {
  collections: StoredCollection[];
  council: Council;
  today: string;
  /** Bank holidays for the council's region. Without them we do not project at all. */
  holidays: string[] | undefined;
}): FeedCollection[] {
  const { collections, council, today, holidays } = input;
  const binTypes = council.bin_types ?? {};
  const horizon = addDays(today, HORIZON_DAYS);
  const result: FeedCollection[] = [];

  const byBin = new Map<string, string[]>();
  for (const collection of collections) {
    if (!binTypes[collection.bin_name]) continue; // a bin we have no mapping for is never shown
    byBin.set(collection.bin_name, [...(byBin.get(collection.bin_name) ?? []), collection.date]);
  }

  for (const [binName, dates] of byBin) {
    const binType = binTypes[binName];
    const label = binType.label ?? binName;
    const confirmed = new Set(dates.filter((date) => date >= today));
    for (const date of confirmed) {
      result.push({ date, bin_name: binName, stream: binType.stream, label, confirmed: true });
    }

    const weeks = binType.every_weeks;
    if (council.schedule !== "next_only" || weeks === undefined || holidays === undefined) continue;
    const anchor = [...dates].sort().at(-1) as string;
    for (let date = addDays(anchor, weeks * 7); date <= horizon; date = addDays(date, weeks * 7)) {
      if (date < today || confirmed.has(date) || inHolidayWeek(date, holidays)) continue;
      result.push({ date, bin_name: binName, stream: binType.stream, label, confirmed: false });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.bin_name.localeCompare(b.bin_name));
}
