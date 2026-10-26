import { describe, expect, it } from "vitest";
import { addDays, buildCalendar, escapeText, foldLine, pocEvents } from "./ics";

const NOW = new Date("2026-10-26T12:00:00Z");

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Bins")).toBe("SUMMARY:Bins");
  });

  it("folds long lines at 75 octets with a leading space", () => {
    const folded = foldLine("SUMMARY:" + "a".repeat(100)).split("\r\n");
    expect(folded[0]).toHaveLength(75);
    expect(folded[1].startsWith(" ")).toBe(true);
    expect(folded.join("").replace(/ /g, "")).toBe("SUMMARY:" + "a".repeat(100));
  });
});

describe("escapeText", () => {
  it("escapes commas, semicolons and newlines", () => {
    expect(escapeText("a,b;c\nd")).toBe("a\\,b\\;c\\nd");
  });
});

describe("addDays", () => {
  it("rolls over month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("pocEvents", () => {
  it("starts on the next Tuesday, never today", () => {
    const events = pocEvents("2026-10-27"); // a Tuesday
    expect(events[0].start).toEqual({ kind: "date", date: "2026-11-03" });
  });

  it("gives each collection an all-day event and an evening-before event", () => {
    const events = pocEvents("2026-10-26");
    const evening = events.find((e) => e.uid === "poc-b-2026-10-27@bin-day");
    expect(evening?.start).toEqual({ kind: "local", date: "2026-10-26", time: "18:00", minutes: 30 });
  });
});

describe("buildCalendar", () => {
  const text = buildCalendar("Bin Day PoC", pocEvents("2026-10-26"), NOW);

  it("is a well-formed calendar with CRLF line endings", () => {
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("defines the London time zone used by timed events", () => {
    expect(text).toContain("TZID:Europe/London");
    expect(text).toContain("DTSTART;TZID=Europe/London:20261026T180000");
  });

  it("uses date-only values for all-day events", () => {
    expect(text).toContain("DTSTART;VALUE=DATE:20261027");
    expect(text).toContain("DTEND;VALUE=DATE:20261028");
  });

  it("puts an alarm on the all-day event six hours before its start", () => {
    expect(text).toContain("TRIGGER:-PT6H");
  });

  it("has a stable UID per event so calendars update rather than duplicate", () => {
    expect(text).toContain("UID:poc-a-2026-10-27@bin-day");
  });
});
