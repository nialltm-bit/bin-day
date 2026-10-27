import { describe, expect, it } from "vitest";
import { SETTING_UP_SUMMARY, UNCONFIRMED_SUMMARY, buildFeed, feedFor } from "./feed";
import { type Council, bankHolidaysFor, getCouncil } from "./registry";
import { memoryTables } from "./test-tables";

const bathnes = getCouncil("E06000022") as Council;
const holidays = bankHolidaysFor("E06000022");
const TOKEN = "a".repeat(64);
const FETCHED = "2026-10-26T05:17:00+00:00";
const NOW = new Date("2026-10-26T12:00:00Z");
const GARDEN_BIN = "Garden Waste Bin";

const bins = [
  { bin: "Black Rubbish Bin (140L)", stream: "general" },
  { bin: "Blue Recycling Bag for Cardboard", stream: "recycling" },
  { bin: "Green Recycling Box", stream: "recycling" },
  { bin: "Food Recycling Collection Bin", stream: "food" },
];
const collections = (date: string, which = bins) => which.map(({ bin, stream }) => ({ date, bin_name: bin, stream }));

function feed(overrides: Partial<Parameters<typeof buildFeed>[0]> = {}) {
  return buildFeed({
    subscription: { id: "abcd1234", garden: false },
    council: bathnes,
    collections: collections("2026-10-30"),
    fetchedAt: FETCHED,
    now: NOW,
    today: "2026-10-26",
    holidays,
    ...overrides,
  });
}

const unfolded = (text: string) => text.replace(/\r\n /g, "");
const eventsOf = (text: string) => unfolded(text).split("BEGIN:VEVENT").slice(1);
const field = (event: string, name: string) => event.split("\r\n").find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

describe("events", () => {
  const events = eventsOf(feed());

  it("makes one all-day event per collection day, with same-day bins merged", () => {
    expect(field(events[0], "SUMMARY")).toBe("SUMMARY:Bins: rubbish + recycling + food");
    expect(field(events[0], "DTSTART")).toBe("DTSTART;VALUE=DATE:20261030");
    expect(field(events[0], "DTEND")).toBe("DTEND;VALUE=DATE:20261031");
  });

  it("shows only the bins that are out that day", () => {
    expect(field(events[1], "SUMMARY")).toBe("SUMMARY:Bins: recycling + food"); // 6 November: rubbish is fortnightly
    expect(field(events[2], "SUMMARY")).toBe("SUMMARY:Bins: rubbish + recycling + food"); // 13 November
  });

  it("lists the council's own bin labels", () => {
    expect(unfolded(events[0])).toContain("Put out: Black bin\\, Blue bag (cardboard)\\, Green box\\, Food caddy.");
  });

  it("says projected dates are expected, and confirmed ones are not", () => {
    expect(events[0]).not.toContain("Expected date");
    expect(unfolded(events[1])).toContain("Expected date\\, confirmed nearer the time.");
  });

  it("gives every event an evening-before alarm", () => {
    for (const event of events) expect(event).toContain("TRIGGER:-PT6H");
  });

  it("is a calendar called Bin Day", () => {
    const text = feed();
    expect(text).toContain("X-WR-CALNAME:Bin Day");
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("is stamped with the fetch time, so it only changes when the data does", () => {
    expect(feed()).toContain("DTSTAMP:20261026T051700Z");
    expect(feed({ now: new Date("2026-10-27T09:00:00Z") })).toEqual(feed());
  });
});

describe("UIDs", () => {
  const uids = (text: string) => eventsOf(text).map((e) => field(e, "UID"));

  it("are stable per person and ISO week", () => {
    expect(uids(feed())[0]).toBe("UID:abcd1234-2026-W44-1@bin-day");
    expect(uids(feed())).toEqual(uids(feed()));
  });

  it("are unique within a feed", () => {
    const all = uids(feed());
    expect(new Set(all).size).toBe(all.length);
  });

  it("stay the same when a date moves within its week, so the event moves instead of duplicating", () => {
    const before = uids(feed({ collections: collections("2026-10-30") }))[0];
    const after = uids(feed({ collections: collections("2026-10-31") }))[0]; // Friday becomes Saturday
    expect(after).toBe(before);
  });

  it("stay the same when a projected date is replaced by a confirmed one", () => {
    const projected = eventsOf(feed()).find((e) => field(e, "DTSTART") === "DTSTART;VALUE=DATE:20261106");
    // Next Sunday's fetch confirms 6 November (and moves nothing).
    const next = feed({
      collections: collections("2026-11-06", bins.filter((b) => b.bin !== "Black Rubbish Bin (140L)")),
      fetchedAt: "2026-11-01T05:17:00+00:00",
      today: "2026-11-01",
    });
    const confirmed = eventsOf(next).find((e) => field(e, "DTSTART") === "DTSTART;VALUE=DATE:20261106");
    expect(field(confirmed as string, "UID")).toBe(field(projected as string, "UID"));
    expect(confirmed).not.toContain("Expected date");
  });

  it("differ between people", () => {
    const other = uids(feed({ subscription: { id: "ffff0000", garden: false } }));
    expect(other[0]).not.toBe(uids(feed())[0]);
  });
});

describe("garden waste", () => {
  const withGarden: Council = {
    ...bathnes,
    bin_types: { ...bathnes.bin_types, [GARDEN_BIN]: { stream: "garden", label: "Garden bin", every_weeks: 2 } },
  };
  const gardenCollections = collections("2026-10-30", [...bins, { bin: GARDEN_BIN, stream: "garden" }]);

  it("leaves garden bins out unless the person subscribes", () => {
    const text = feed({ council: withGarden, collections: gardenCollections });
    expect(text).not.toContain("garden");
    expect(text).not.toContain("Garden");
  });

  it("includes garden bins for people who opted in", () => {
    const text = feed({ council: withGarden, collections: gardenCollections, subscription: { id: "abcd1234", garden: true } });
    expect(eventsOf(text)[0]).toContain("SUMMARY:Bins: rubbish + recycling + food + garden");
  });
});

describe("unconfirmed and new feeds", () => {
  it("says it is getting the dates before the first fetch", () => {
    const text = feed({ fetchedAt: null, collections: [] });
    expect(eventsOf(text)).toHaveLength(1);
    expect(unfolded(text)).toContain(`SUMMARY:${SETTING_UP_SUMMARY.replace(",", "\\,")}`);
    expect(text).not.toContain("Bins:");
  });

  it("shows no dates once the last good fetch is too old to trust", () => {
    const text = feed({ fetchedAt: "2026-10-11T05:17:00+00:00" }); // 15 days before 26 October
    expect(eventsOf(text)).toHaveLength(1);
    expect(unfolded(text)).toContain(`SUMMARY:${UNCONFIRMED_SUMMARY.replace(",", "\\,")}`);
    expect(text).not.toContain("Bins:");
  });

  it("still shows dates 14 days after the last good fetch", () => {
    expect(feed({ fetchedAt: "2026-10-12T05:17:00+00:00" })).toContain("Bins:");
  });
});

describe("feedFor", () => {
  function seeded() {
    const store = memoryTables();
    store.subscriptions.push({ token: TOKEN, id: "abcd1234", uprn: "100120000855", ons_code: "E06000022", garden: false, created_at: "x" });
    store.results.set("100120000855", {
      uprn: "100120000855",
      fetched_at: FETCHED,
      last_attempt: FETCHED,
      last_error: null,
      consecutive_failures: 0,
      collections: collections("2026-10-30") as never,
    });
    return store;
  }
  const deps = (store: ReturnType<typeof memoryTables>) => ({ tables: store.tables, now: NOW, today: "2026-10-26" });

  it("returns the feed for a known token", () => {
    const text = feedFor(TOKEN, deps(seeded()));
    expect(text).toContain("SUMMARY:Bins: rubbish + recycling + food");
  });

  it("never puts the token or the UPRN in the calendar", () => {
    const text = feedFor(TOKEN, deps(seeded())) as string;
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("100120000855");
  });

  it("returns null for unknown or malformed tokens without touching the tables", () => {
    const store = seeded();
    expect(feedFor("b".repeat(64), deps(store))).toBeNull();
    for (const bad of ["", "poc", "A".repeat(64), "a".repeat(63), `${"a".repeat(63)}'`]) expect(feedFor(bad, deps(store))).toBeNull();
  });

  it("says it is setting up when no fetch has happened yet", () => {
    const store = seeded();
    store.results.clear();
    expect(feedFor(TOKEN, deps(store))).toContain("getting your collection dates");
  });
});

describe("change warnings in the feed", () => {
  const changes = [
    {
      at: "2026-11-01T05:17:00+00:00",
      uprn: "100120000855",
      ons_code: "E06000022",
      bin_name: "Food Recycling Collection Bin",
      kind: "round_change",
      before: "2026-11-06",
      after: "2026-11-05",
      note: "weekday changed",
    },
  ];
  const movedFeed = () =>
    feed({
      collections: collections("2026-11-05", bins.filter((b) => b.bin !== "Black Rubbish Bin (140L)")),
      fetchedAt: "2026-11-01T05:17:00+00:00",
      today: "2026-11-02",
      changes,
    });

  it("carries the warning and the moved collection together, in date order", () => {
    const summaries = eventsOf(movedFeed()).map((e) => field(e, "SUMMARY"));
    expect(summaries[0]).toBe("SUMMARY:Bin days change next week\\, now Thursdays");
    expect(summaries[1]).toBe("SUMMARY:Bins: recycling + food");
    expect(eventsOf(movedFeed()).map((e) => field(e, "DTSTART"))[1]).toBe("DTSTART;VALUE=DATE:20261105");
  });

  it("gives the warning an alarm, and the moved collection its usual evening-before one", () => {
    expect(eventsOf(movedFeed())[0]).toContain("TRIGGER:PT9H");
    expect(eventsOf(movedFeed())[1]).toContain("TRIGGER:-PT6H");
  });

  it("shows no warning for an expected holiday shift", () => {
    const quiet = feed({ changes: changes.map((c) => ({ ...c, kind: "expected_shift" })) });
    expect(unfolded(quiet)).not.toContain("Bin days change");
  });

  it("never puts the address in the warning", () => {
    expect(movedFeed()).not.toContain("100120000855");
  });
});

describe("unconfirmed data", () => {
  const notice = (text: string) => unfolded(text).includes("Couldn't confirm this week's collection\\, check the council site");

  it("says nothing when the last check succeeded recently", () => {
    expect(notice(feed({ consecutiveFailures: 0 }))).toBe(false);
  });

  it("keeps the last good dates but says so when the last check failed", () => {
    const text = feed({ consecutiveFailures: 1 });
    expect(notice(text)).toBe(true);
    expect(text).toContain("SUMMARY:Bins: rubbish + recycling + food");
  });

  it("flags dates when a weekly check is overdue", () => {
    expect(notice(feed({ fetchedAt: "2026-10-17T05:17:00+00:00" }))).toBe(true); // 9 days before 26 October: a cycle was missed
    expect(notice(feed({ fetchedAt: "2026-10-18T05:17:00+00:00" }))).toBe(false); // 8 days: still within a cycle and a day
  });

  it("shows only the notice, no dates, once the last good fetch is more than two weeks old", () => {
    const text = feed({ fetchedAt: "2026-10-11T05:17:00+00:00", consecutiveFailures: 3 });
    expect(notice(text)).toBe(true);
    expect(text).not.toContain("Bins:");
  });

  it("says it couldn't confirm, not 'getting your dates', when the first fetches have failed", () => {
    const text = feed({ fetchedAt: null, collections: [], consecutiveFailures: 2 });
    expect(notice(text)).toBe(true);
    expect(text).not.toContain("getting your collection dates");
  });

  it("keeps the same UID for the notice, so it moves along instead of piling up", () => {
    const first = eventsOf(feed({ consecutiveFailures: 1, today: "2026-10-27" })).find((e) => unfolded(e).includes("Couldn't confirm"));
    const next = eventsOf(feed({ consecutiveFailures: 1, today: "2026-10-28" })).find((e) => unfolded(e).includes("Couldn't confirm"));
    expect(field(first as string, "UID")).toBe(field(next as string, "UID"));
  });
});

describe("feedFor with change history", () => {
  it("reads the recorded changes and failures for the address", () => {
    const store = memoryTables();
    store.subscriptions.push({ token: TOKEN, id: "abcd1234", uprn: "100120000855", ons_code: "E06000022", garden: false, created_at: "x" });
    store.results.set("100120000855", {
      uprn: "100120000855",
      fetched_at: "2026-11-01T05:17:00+00:00",
      last_attempt: "2026-11-01T05:17:00+00:00",
      last_error: null,
      consecutive_failures: 1,
      collections: collections("2026-11-05", bins.filter((b) => b.bin !== "Black Rubbish Bin (140L)")) as never,
    });
    store.changes.push({
      at: "2026-11-01T05:17:00+00:00",
      uprn: "100120000855",
      ons_code: "E06000022",
      bin_name: "Food Recycling Collection Bin",
      kind: "round_change",
      before: "2026-11-06",
      after: "2026-11-05",
      note: "x",
    });
    store.changes.push({ ...store.changes[0], uprn: "999", after: "2026-11-04" }); // someone else's change
    const text = unfolded(feedFor(TOKEN, { tables: store.tables, now: NOW, today: "2026-11-02" }) as string);
    expect(text).toContain("Bin days change next week\\, now Thursdays");
    expect(text).toContain("Couldn't confirm this week's collection");
    expect(text.match(/Bin days change/g)).toHaveLength(2); // the summary and its alarm, once
  });
});
