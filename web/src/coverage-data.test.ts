import { describe, expect, it } from "vitest";
import councilData from "../../registry/councils.json";
import type { CouncilEntry } from "./coverage";
import { LABELS, ORDER, buildViews, centreOf, countByAvailability, describe as describeView, filterViews, summary } from "./coverage-data";

const REAL = (councilData as { councils: CouncilEntry[] }).councils;
const REGISTRY: CouncilEntry[] = [
  { ons_code: "E1", name: "Numberton", status: "supported", inputs: ["postcode", "house_number"] },
  { ons_code: "E2", name: "Uprnton", status: "supported", inputs: ["uprn"] },
  { ons_code: "E3", name: "Brokenshire", status: "broken", inputs: ["house_number"] },
  { ons_code: "E4", name: "Nowhere Yet", status: "unsupported" },
  { ons_code: "E9", name: "No Outline", status: "supported", inputs: ["house_number"] },
];
const NAMES = [
  { code: "E3", name: "Brokenshire" },
  { code: "E1", name: "Numberton" },
  { code: "E5", name: "Unlisted" },
  { code: "E2", name: "Uprnton" },
  { code: "E4", name: "Nowhere Yet" },
];

describe("buildViews", () => {
  const views = buildViews(NAMES, REGISTRY);
  const by = (code: string) => views.find((v) => v.code === code)?.availability;

  it("matches each council's registry state", () => {
    expect([by("E1"), by("E2"), by("E3"), by("E4"), by("E5")]).toEqual(["available", "soon", "broken", "none", "none"]);
  });

  it("lists a registry council that has no outline, and sorts by name", () => {
    expect(by("E9")).toBe("available");
    expect(views.map((v) => v.name)).toEqual([...views.map((v) => v.name)].sort((a, b) => a.localeCompare(b, "en-GB")));
  });

  it("turns UPRN councils on when a finder exists", () => {
    expect(buildViews(NAMES, REGISTRY, true).find((v) => v.code === "E2")?.availability).toBe("available");
  });

  it("with the real registry, B&NES is on the way, not covered", () => {
    expect(buildViews([{ code: "E06000022", name: "Bath and North East Somerset" }], REAL)[0].availability).toBe("soon");
  });
});

describe("summary and description", () => {
  it("says plainly when nothing is covered, and counts what is on the way", () => {
    const views = buildViews([{ code: "E06000022", name: "Bath and North East Somerset" }, { code: "E06000001", name: "Hartlepool" }], REAL);
    expect(summary(views)).toBe("We can show bin days for 0 of 2 councils. 1 more is on the way.");
  });

  it("does not mention the on-the-way count when there is none", () => {
    expect(summary(buildViews([{ code: "E4", name: "Nowhere Yet" }], [REGISTRY[3]]))).toBe("We can show bin days for 0 of 1 council.");
  });

  it("counts every availability", () => {
    expect(countByAvailability(buildViews(NAMES, REGISTRY))).toEqual({ available: 2, soon: 1, broken: 1, none: 2 });
  });

  it("describes every state without promising a date or asking for contact details", () => {
    for (const availability of ORDER) {
      const text = describeView({ code: "E1", name: "Somewhere", availability });
      expect(text).toContain("Somewhere");
      expect(text.toLowerCase()).not.toMatch(/we'll|we will|email|soon!|\bby (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
      expect(LABELS[availability].length).toBeGreaterThan(0);
    }
  });
});

describe("filterViews", () => {
  const views = buildViews(NAMES, REGISTRY);
  it("matches any part of a name, ignoring case and surrounding spaces", () => {
    expect(filterViews(views, "  ton ").map((v) => v.name)).toEqual(["Numberton", "Uprnton"]);
    expect(filterViews(views, "NOWHERE").map((v) => v.code)).toEqual(["E4"]);
  });
  it("returns everything for an empty query and nothing for no match", () => {
    expect(filterViews(views, "")).toHaveLength(views.length);
    expect(filterViews(views, "zzz")).toEqual([]);
  });
});

describe("centreOf", () => {
  it("is the middle of the bounding box of every ring", () => {
    expect(centreOf("M10 20L30 20L30 60L10 60ZM50 0L70 0L70 10Z")).toEqual({ x: 40, y: 30 });
  });
  it("copes with decimals and finds nothing in an empty path", () => {
    expect(centreOf("M1.5 2.5L3.5 4.5Z")).toEqual({ x: 2.5, y: 3.5 });
    expect(centreOf("")).toBeNull();
  });
});
