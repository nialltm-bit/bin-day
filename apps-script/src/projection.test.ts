import { describe, expect, it } from "vitest";
import { inHolidayWeek, projectCollections } from "./projection";
import { type Council, bankHolidaysFor, getCouncil } from "./registry";

const bathnes = getCouncil("E06000022") as Council;
const holidays = bankHolidaysFor("E06000022");

const ALL_FOUR = ["Black Rubbish Bin (140L)", "Blue Recycling Bag for Cardboard", "Green Recycling Box", "Food Recycling Collection Bin"];
const stored = (date: string, bins: string[] = ALL_FOUR) => bins.map((bin_name) => ({ date, bin_name, stream: "x" }));
const dates = (result: ReturnType<typeof projectCollections>, bin: string) => result.filter((c) => c.bin_name === bin).map((c) => c.date);

describe("projecting a next_only council", () => {
  const result = projectCollections({ collections: stored("2026-10-30"), council: bathnes, today: "2026-10-26", holidays });

  it("keeps the confirmed date and marks it confirmed", () => {
    const first = result.filter((c) => c.date === "2026-10-30");
    expect(first).toHaveLength(4);
    expect(first.every((c) => c.confirmed)).toBe(true);
  });

  it("projects weekly bins every week, up to eight weeks ahead", () => {
    expect(dates(result, "Green Recycling Box")).toEqual([
      "2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27", "2026-12-04", "2026-12-11", "2026-12-18",
    ]);
  });

  it("projects the fortnightly rubbish bin every other week", () => {
    expect(dates(result, "Black Rubbish Bin (140L)")).toEqual(["2026-10-30", "2026-11-13", "2026-11-27", "2026-12-11"]);
  });

  it("marks everything beyond the confirmed date as projected", () => {
    expect(result.filter((c) => c.date > "2026-10-30").every((c) => !c.confirmed)).toBe(true);
  });

  it("never goes past eight weeks", () => {
    expect(result.every((c) => c.date <= "2026-12-21")).toBe(true);
  });
});

describe("holiday weeks", () => {
  it("does not project into a bank holiday week, but carries on after it", () => {
    const result = projectCollections({
      collections: stored("2026-04-30", ["Green Recycling Box"]),
      council: bathnes,
      today: "2026-04-27",
      holidays,
    });
    // 4 May is a bank holiday, so the week of 7 May is skipped; 25 May likewise, so 28 May is skipped.
    expect(dates(result, "Green Recycling Box")).toEqual(["2026-04-30", "2026-05-14", "2026-05-21", "2026-06-04", "2026-06-11", "2026-06-18"]);
  });

  it("does not project into Christmas and New Year, and resumes after it", () => {
    const result = projectCollections({
      collections: stored("2026-12-18", ["Green Recycling Box"]),
      council: bathnes,
      today: "2026-12-14",
      holidays,
    });
    expect(dates(result, "Green Recycling Box")).toEqual(["2026-12-18", "2027-01-22", "2027-01-29", "2027-02-05"]);
  });

  it("shows a confirmed date inside a holiday week", () => {
    const result = projectCollections({
      collections: stored("2026-12-31", ["Green Recycling Box"]),
      council: bathnes,
      today: "2026-12-28",
      holidays,
    });
    expect(result[0]).toMatchObject({ date: "2026-12-31", confirmed: true });
  });

  it("recognises holiday weeks", () => {
    expect(inHolidayWeek("2026-05-07", holidays as string[])).toBe(true); // week of Monday 4 May
    expect(inHolidayWeek("2026-05-14", holidays as string[])).toBe(false);
    expect(inHolidayWeek("2026-12-21", holidays as string[])).toBe(true); // overlaps 22 December
    expect(inHolidayWeek("2027-01-13", holidays as string[])).toBe(true);
    expect(inHolidayWeek("2027-01-18", holidays as string[])).toBe(false);
  });

  it("does not project at all when the region's bank holidays are unknown", () => {
    const result = projectCollections({ collections: stored("2026-10-30"), council: bathnes, today: "2026-10-26", holidays: undefined });
    expect(result.every((c) => c.confirmed)).toBe(true);
    expect(result).toHaveLength(4);
  });
});

describe("other cases", () => {
  it("projects forward from a confirmed date that has now passed, without calling it confirmed", () => {
    const result = projectCollections({ collections: stored("2026-10-23", ["Green Recycling Box"]), council: bathnes, today: "2026-10-26", holidays });
    expect(result[0]).toMatchObject({ date: "2026-10-30", confirmed: false });
    expect(result.some((c) => c.date === "2026-10-23")).toBe(false);
  });

  it("does not project for a council that returns a full schedule", () => {
    const full: Council = { ...bathnes, schedule: "full" };
    const result = projectCollections({ collections: stored("2026-10-30", ["Green Recycling Box"]), council: full, today: "2026-10-26", holidays });
    expect(result).toHaveLength(1);
    expect(result[0].confirmed).toBe(true);
  });

  it("ignores bins the registry has no mapping for", () => {
    const result = projectCollections({ collections: stored("2026-10-30", ["Purple Garden Sack"]), council: bathnes, today: "2026-10-26", holidays });
    expect(result).toEqual([]);
  });

  it("skips past dates", () => {
    const result = projectCollections({ collections: stored("2026-10-20", ["Black Rubbish Bin (140L)"]), council: bathnes, today: "2026-10-26", holidays });
    expect(result.every((c) => c.date >= "2026-10-26")).toBe(true);
    expect(result[0].date).toBe("2026-11-03"); // 20 Oct plus two weeks
  });
});
