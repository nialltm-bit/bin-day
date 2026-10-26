import { describe, expect, it } from "vitest";
import { daysBetween, isoWeek, mondayOf, weekdayIndex } from "./dates";

describe("dates", () => {
  it("numbers weekdays from Monday", () => {
    expect(weekdayIndex("2026-10-26")).toBe(0); // Monday
    expect(weekdayIndex("2026-11-01")).toBe(6); // Sunday
  });

  it("finds the Monday of a week, including for a Sunday", () => {
    expect(mondayOf("2026-10-30")).toBe("2026-10-26");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
  });

  it("counts days between dates across a clock change", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-10-26", "2026-10-26")).toBe(0);
  });

  it("gives ISO week numbers, including at year boundaries", () => {
    expect(isoWeek("2026-10-26")).toBe("2026-W44");
    expect(isoWeek("2026-11-01")).toBe("2026-W44");
    expect(isoWeek("2026-11-02")).toBe("2026-W45");
    expect(isoWeek("2026-01-01")).toBe("2026-W01"); // Thursday
    expect(isoWeek("2027-01-01")).toBe("2026-W53"); // Friday, still in 2026's last week
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(isoWeek("2025-12-29")).toBe("2026-W01"); // Monday of the week containing 1 January 2026
  });
});
