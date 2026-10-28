/** Joins the council outlines to the registry, so the homepage list and map show the same thing. */
import { type Availability, type CouncilEntry, availabilityOf } from "./coverage";

export interface Shape {
  code: string;
  name: string;
  /** SVG path data. */
  d: string;
}

export interface Shapes {
  viewBox: string;
  councils: Shape[];
}

export interface CouncilView {
  code: string;
  name: string;
  availability: Availability;
}

export const ORDER: Availability[] = ["available", "soon", "broken", "none"];

export function buildViews(names: { code: string; name: string }[], registry: CouncilEntry[], canFindUprn = false): CouncilView[] {
  const byCode = new Map(registry.map((c) => [c.ons_code, c]));
  const seen = new Set<string>();
  const views: CouncilView[] = [];
  for (const { code, name } of names) {
    seen.add(code);
    views.push({ code, name, availability: availabilityOf(byCode.get(code), canFindUprn) });
  }
  // A council in the registry that has no outline still gets listed, so the list is never missing one we handle.
  for (const council of registry) {
    if (!seen.has(council.ons_code)) views.push({ code: council.ons_code, name: council.name, availability: availabilityOf(council, canFindUprn) });
  }
  return views.sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export function countByAvailability(views: CouncilView[]): Record<Availability, number> {
  const counts: Record<Availability, number> = { available: 0, soon: 0, broken: 0, none: 0 };
  for (const v of views) counts[v.availability] += 1;
  return counts;
}

/** One sentence that is true however much is covered. */
export function summary(views: CouncilView[]): string {
  const counts = countByAvailability(views);
  const total = views.length;
  const parts = [`We can show bin days for ${counts.available} of ${total} ${total === 1 ? "council" : "councils"}.`];
  if (counts.soon > 0) parts.push(`${counts.soon} more ${counts.soon === 1 ? "is" : "are"} on the way.`);
  return parts.join(" ");
}

export function describe(view: CouncilView): string {
  switch (view.availability) {
    case "available":
      return `${view.name}: covered. Enter your postcode to see your bin days.`;
    case "soon":
      return `${view.name}: on the way. We can read this council's bin days but can't yet match your address to its records.`;
    case "broken":
      return `${view.name}: covered, but its bin day data isn't working right now.`;
    case "none":
      return `${view.name}: not covered yet.`;
  }
}

export const LABELS: Record<Availability, string> = {
  available: "Covered",
  soon: "On the way",
  broken: "Not working right now",
  none: "Not covered yet",
};

/** Case-insensitive match on any part of the name. */
export function filterViews(views: CouncilView[], query: string): CouncilView[] {
  const q = query.trim().toLowerCase();
  return q === "" ? views : views.filter((v) => v.name.toLowerCase().includes(q));
}

/** The middle of a path's bounding box, for drawing a marker on a small council. Null if the path has no points. */
export function centreOf(d: string): { x: number; y: number } | null {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    minX = Math.min(minX, numbers[i]);
    maxX = Math.max(maxX, numbers[i]);
    minY = Math.min(minY, numbers[i + 1]);
    maxY = Math.max(maxY, numbers[i + 1]);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** London's 32 boroughs and the City of London all have ONS codes starting E09. */
export function isLondon(code: string): boolean {
  return code.startsWith("E09");
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box that holds every point of the given paths. Null if there are no points. */
export function boundsOf(paths: string[]): Bounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const d of paths) {
    const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      minX = Math.min(minX, numbers[i]);
      maxX = Math.max(maxX, numbers[i]);
      minY = Math.min(minY, numbers[i + 1]);
      maxY = Math.max(maxY, numbers[i + 1]);
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The same box with a margin round it, as an SVG viewBox. */
export function viewBoxFor(bounds: Bounds, margin = 0.05): string {
  const mx = bounds.width * margin;
  const my = bounds.height * margin;
  const round = (n: number) => Math.round(n * 10) / 10;
  return `${round(bounds.x - mx)} ${round(bounds.y - my)} ${round(bounds.width + 2 * mx)} ${round(bounds.height + 2 * my)}`;
}
