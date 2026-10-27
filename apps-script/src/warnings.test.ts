import { describe, expect, it } from "vitest";
import { type Council, getCouncil } from "./registry";
import type { ChangeRow } from "./service";
import { changeWarnings, dayName, longDate } from "./warnings";

const bathnes = getCouncil("E06000022") as Council;
const FOOD = "Food Recycling Collection Bin";
const GREEN = "Green Recycling Box";
const BLACK = "Black Rubbish Bin (140L)";

function change(overrides: Partial<ChangeRow> = {}): ChangeRow {
  return {
    at: "2026-11-01T05:17:00+00:00",
    uprn: "1",
    ons_code: "E06000022",
    bin_name: FOOD,
    kind: "round_change",
    before: "2026-11-06",
    after: "2026-11-05",
    note: "weekday changed",
    ...overrides,
  };
}

function warnings(changes: ChangeRow[], today = "2026-11-02", garden = false, council = bathnes) {
  return changeWarnings({ id: "abcd1234", council, garden, changes, today });
}

describe("dates in words", () => {
  it("names days and dates", () => {
    expect(dayName("2026-11-05")).toBe("Thursday");
    expect(longDate("2026-11-05")).toBe("Thursday 5 November");
    expect(longDate("2027-01-04")).toBe("Monday 4 January");
  });
});

describe("a weekday change", () => {
  const events = warnings([change(), change({ bin_name: GREEN })]);

  it("gives one warning, about a week before, saying the new day", () => {
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Bin days change next week, now Thursdays");
    expect(events[0].start).toEqual({ kind: "date", date: "2026-11-01" });
  });

  it("lists each bin's new and old date in the council's own words", () => {
    expect(events[0].description).toBe(
      "Food caddy: Thursday 5 November instead of Friday 6 November.\nGreen box: Thursday 5 November instead of Friday 6 November.",
    );
  });

  it("carries an alarm, at 9am on its own day so it is never already in the past", () => {
    expect(events[0].alarm).toBe("PT9H");
  });

  it("has a stable UID per person and day it was found", () => {
    expect(events[0].uid).toBe("abcd1234-change-2026-11-01@bin-day");
    expect(warnings([change()])[0].uid).toBe(events[0].uid);
  });
});

describe("other kinds of change", () => {
  it("does not say 'now' when the weekday did not move (a fortnight flip)", () => {
    const events = warnings([change({ bin_name: BLACK, before: "2026-11-13", after: "2026-11-06" })]);
    expect(events[0].summary).toBe("Bin days change next week");
    expect(events[0].description).toBe("Black bin: Friday 6 November instead of Friday 13 November.");
  });

  it("does not name a day when bins moved to different days", () => {
    const events = warnings([change(), change({ bin_name: GREEN, after: "2026-11-04" })]);
    expect(events[0].summary).toBe("Bin days change next week");
  });

  it("is silent for expected holiday shifts", () => {
    expect(warnings([change({ kind: "expected_shift" })])).toEqual([]);
  });

  it("describes a collection that appeared or vanished", () => {
    const events = warnings([change({ before: null, after: "2026-11-05" }), change({ bin_name: GREEN, before: "2026-11-06", after: null })]);
    expect(events[0].description).toBe(
      "Food caddy: a new collection on Thursday 5 November.\nGreen box: the collection on Friday 6 November is no longer listed.",
    );
  });
});

describe("timing", () => {
  it("says 'this week' when the change is in the same week it was found", () => {
    const events = warnings([change({ at: "2026-11-04T05:17:00+00:00" })], "2026-11-04");
    expect(events[0].summary).toBe("Bin days change this week, now Thursdays");
  });

  it("holds the warning back to a week before a change that was found early", () => {
    const events = warnings([change({ before: "2026-11-27", after: "2026-11-19" })], "2026-11-02");
    expect(events[0].start).toEqual({ kind: "date", date: "2026-11-12" });
    expect(events[0].summary).toBe("Bin days change next week, now Thursdays");
  });

  it("keeps showing a change until a week after the changed date, then drops it", () => {
    expect(warnings([change()], "2026-11-12")).toHaveLength(1); // a week after Thursday 5 November
    expect(warnings([change()], "2026-11-13")).toEqual([]);
  });

  it("never shows a change found more than four weeks ago, even if its date is still ahead", () => {
    const early = change({ at: "2026-10-01T05:17:00+00:00", before: "2026-11-27", after: "2026-11-26" });
    expect(warnings([early], "2026-10-29")).toHaveLength(1);
    expect(warnings([early], "2026-10-30")).toEqual([]);
  });

  it("gives separate warnings for changes found on different days", () => {
    const events = warnings([change(), change({ at: "2026-11-08T05:17:00+00:00", before: "2026-11-13", after: "2026-11-12" })], "2026-11-09");
    expect(events.map((e) => e.uid)).toEqual(["abcd1234-change-2026-11-01@bin-day", "abcd1234-change-2026-11-08@bin-day"]);
  });
});

describe("garden waste", () => {
  const withGarden: Council = {
    ...bathnes,
    bin_types: { ...bathnes.bin_types, "Garden Waste Bin": { stream: "garden", label: "Garden bin", every_weeks: 2 } },
  };
  const gardenChange = change({ bin_name: "Garden Waste Bin" });

  it("hides garden changes from people without a garden bin", () => {
    expect(warnings([gardenChange], "2026-11-02", false, withGarden)).toEqual([]);
  });

  it("shows them to people with one", () => {
    expect(warnings([gardenChange], "2026-11-02", true, withGarden)[0].description).toContain("Garden bin");
  });
});
