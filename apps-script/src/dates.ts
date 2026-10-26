/** Date helpers on plain YYYY-MM-DD strings, so nothing depends on the machine's time zone. */
import { addDays } from "./ics";

export { addDays };

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(date: string): number {
  return (utc(date).getUTCDay() + 6) % 7;
}

export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000);
}

/** ISO 8601 week, for example "2026-W44". The week belongs to the year of its Thursday. */
export function isoWeek(date: string): string {
  const monday = mondayOf(date);
  const year = Number(addDays(monday, 3).slice(0, 4));
  const week = 1 + daysBetween(mondayOf(`${year}-01-04`), monday) / 7;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
