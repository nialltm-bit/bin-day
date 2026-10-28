/** The "Where we cover" section of the homepage: a list and a map of the same data. */
import type { CouncilEntry } from "./coverage";
import { type CouncilView, LABELS, ORDER, type Shapes, boundsOf, buildViews, centreOf, describe, filterViews, isLondon, summary, viewBoxFor } from "./coverage-data";

import { el } from "./dom";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

export interface MountOptions {
  registry: CouncilEntry[];
  /** Resolves to the council outlines, or rejects if they can't be loaded. */
  loadShapes: () => Promise<Shapes>;
}

export async function mountCoverage(root: HTMLElement, { registry, loadShapes }: MountOptions): Promise<void> {
  const shapes: Shapes | null = await loadShapes().catch(() => null);
  const views = buildViews(shapes?.councils ?? [], registry);

  const summaryLine = el("p", { class: "coverage-summary" }, summary(views));
  const mapTab = el("button", { role: "tab", id: "coverage-tab-map", "aria-controls": "coverage-map", "aria-selected": "true", type: "button" }, "Map");
  const listTab = el("button", { role: "tab", id: "coverage-tab-list", "aria-controls": "coverage-list", "aria-selected": "false", tabindex: "-1", type: "button" }, "List");
  const tabs = el("div", { role: "tablist", "aria-label": "Show coverage as" }, mapTab, listTab);

  const mapPanel = buildMap(views, shapes);
  const listPanel = buildList(views, shapes === null);

  function select(tab: "list" | "map"): void {
    const showList = tab === "list";
    listTab.setAttribute("aria-selected", String(showList));
    mapTab.setAttribute("aria-selected", String(!showList));
    listTab.tabIndex = showList ? 0 : -1;
    mapTab.tabIndex = showList ? -1 : 0;
    listPanel.hidden = !showList;
    mapPanel.hidden = showList;
  }
  listTab.addEventListener("click", () => select("list"));
  mapTab.addEventListener("click", () => select("map"));
  tabs.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const next = mapTab.getAttribute("aria-selected") === "true" ? "list" : "map";
      select(next);
      (next === "map" ? mapTab : listTab).focus();
    }
  });
  // The map is the way in, unless it didn't load, in which case the list is.
  select(shapes === null ? "list" : "map");

  root.replaceChildren(
    el("h2", { id: "coverage-title" }, "Where we cover"),
    summaryLine,
    tabs,
    mapPanel,
    listPanel,
    el(
      "p",
      { class: "credit" },
      "Council boundaries: Office for National Statistics, Crown copyright and database right, under the Open Government Licence v3.0.",
    ),
  );
}

function buildList(views: CouncilView[], outlinesMissing: boolean): HTMLElement {
  const search = el("input", { type: "search", id: "coverage-search", autocomplete: "off", placeholder: "Type a council name" });
  const label = el("label", { for: "coverage-search" }, "Find your council");
  const results = el("div", { class: "results" });
  const panel = el("div", { role: "tabpanel", id: "coverage-list", "aria-labelledby": "coverage-tab-list" }, label, search, results);
  if (outlinesMissing) {
    panel.append(el("p", { class: "note" }, "The full list of councils didn't load, so this shows only the councils we have work on."));
  }

  function render(): void {
    const query = search.value;
    const shown = filterViews(views, query);
    const searching = query.trim() !== "";
    const pieces: HTMLElement[] = [];
    // Every group folds the same way, closed to start with so a long one never pushes the others off the page. A search
    // opens the groups it found something in.
    for (const availability of ORDER) {
      const items = shown.filter((v) => v.availability === availability);
      if (items.length === 0) continue;
      const details = el(
        "details",
        { class: "group" },
        el("summary", {}, `${LABELS[availability]} (${items.length})`),
        el("ul", {}, ...items.map((v) => el("li", { class: `c-${v.availability}` }, v.name))),
      );
      if (searching) details.setAttribute("open", "");
      pieces.push(details);
    }
    if (pieces.length === 0) pieces.push(el("p", { class: "note" }, "No council matches that name."));
    results.replaceChildren(...pieces);
  }
  search.addEventListener("input", render);
  render();
  return panel;
}

function stripes(): SVGElement {
  const defs = svgEl("defs");
  const pattern = svgEl("pattern", { id: "soon-stripes", width: "8", height: "8", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pattern.append(svgEl("rect", { width: "8", height: "8", class: "stripe-bg" }), svgEl("rect", { width: "3", height: "8", class: "stripe-fg" }));
  defs.append(pattern);
  return defs;
}

/** Draws the given councils into an svg, with a ring round each one we have any work on. */
function draw(svg: SVGElement, shapes: Shapes["councils"], byCode: Map<string, CouncilView>, ringRadius: number): void {
  for (const shape of shapes) {
    const view = byCode.get(shape.code);
    const path = svgEl("path", { d: shape.d, class: `c-${view?.availability ?? "none"}`, "data-code": shape.code });
    const title = svgEl("title");
    title.textContent = view ? `${view.name}: ${LABELS[view.availability]}` : shape.name;
    path.append(title);
    svg.append(path);
  }
  // A ring so a small council isn't lost, on a map of the whole country or of London.
  for (const shape of shapes) {
    const availability = byCode.get(shape.code)?.availability;
    const centre = availability && availability !== "none" ? centreOf(shape.d) : null;
    if (centre) svg.append(svgEl("circle", { cx: String(centre.x), cy: String(centre.y), r: String(ringRadius), class: `ring r-${availability}`, "pointer-events": "none" }));
  }
}

function buildMap(views: CouncilView[], shapes: Shapes | null): HTMLElement {
  const panel = el("div", { role: "tabpanel", id: "coverage-map", "aria-labelledby": "coverage-tab-map" });
  if (shapes === null) {
    panel.append(el("p", { class: "note" }, "The map didn't load. The list shows the same information."));
    return panel;
  }
  const byCode = new Map(views.map((v) => [v.code, v]));
  const info = el("p", { class: "map-info", "aria-live": "polite" }, "Tap a council to see its status.");
  const label = "coloured by whether we cover each council. The list shows the same information.";

  const [, , mainWidth] = shapes.viewBox.split(" ").map(Number);
  const main = svgEl("svg", { viewBox: shapes.viewBox, class: "map", role: "img", "aria-label": `Map of councils in Great Britain and Northern Ireland, ${label}` });
  main.append(stripes());
  draw(main, shapes.councils, byCode, mainWidth / 60);

  const london = shapes.councils.filter((c) => isLondon(c.code));
  const bounds = boundsOf(london.map((c) => c.d));
  const maps = el("div", { class: "maps" }, el("div", { class: "main-map" }, main));
  if (bounds && london.length > 0) {
    const inset = svgEl("svg", { viewBox: viewBoxFor(bounds), class: "map", role: "img", "aria-label": `Map of London's boroughs, ${label}` });
    draw(inset, london, byCode, bounds.width / 22);
    // A dashed box on the main map shows where the London map is from.
    const box = viewBoxFor(bounds, 0.12).split(" ").map(Number);
    main.append(svgEl("rect", { x: String(box[0]), y: String(box[1]), width: String(box[2]), height: String(box[3]), class: "london-box", "pointer-events": "none" }));
    maps.append(el("div", { class: "london" }, el("h3", {}, "London"), inset));
  }

  let selected: Element[] = [];
  maps.addEventListener("click", (event) => {
    const path = (event.target as Element).closest("path");
    const code = path?.getAttribute("data-code") ?? "";
    const view = byCode.get(code);
    if (!path || !view) return;
    for (const old of selected) old.classList.remove("selected");
    // A London borough is on both maps, so mark it on both.
    selected = [...maps.querySelectorAll("path")].filter((p) => p.getAttribute("data-code") === code);
    for (const p of selected) p.classList.add("selected");
    info.textContent = describe(view);
  });

  const legend = el(
    "ul",
    { class: "legend" },
    ...ORDER.map((availability) => el("li", {}, el("span", { class: `swatch c-${availability}`, "aria-hidden": "true" }), LABELS[availability])),
  );
  panel.append(info, maps, legend);
  return panel;
}
