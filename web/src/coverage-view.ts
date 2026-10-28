/** The "Where we cover" section of the homepage: a list and a map of the same data. */
import type { CouncilEntry } from "./coverage";
import { type CouncilView, LABELS, ORDER, type Shapes, buildViews, centreOf, describe, filterViews, summary } from "./coverage-data";

const SVG_NS = "http://www.w3.org/2000/svg";

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

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
  const listTab = el("button", { role: "tab", id: "coverage-tab-list", "aria-controls": "coverage-list", "aria-selected": "true", type: "button" }, "List");
  const mapTab = el("button", { role: "tab", id: "coverage-tab-map", "aria-controls": "coverage-map", "aria-selected": "false", tabindex: "-1", type: "button" }, "Map");
  const tabs = el("div", { role: "tablist", "aria-label": "Show coverage as" }, listTab, mapTab);

  const listPanel = buildList(views, shapes === null);
  const mapPanel = buildMap(views, shapes);
  mapPanel.hidden = true;

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
      const next = listTab.getAttribute("aria-selected") === "true" ? "map" : "list";
      select(next);
      (next === "map" ? mapTab : listTab).focus();
    }
  });

  root.replaceChildren(
    el("h2", { id: "coverage-title" }, "Where we cover"),
    summaryLine,
    tabs,
    listPanel,
    mapPanel,
    el(
      "p",
      { class: "credit" },
      "Council boundaries: Office for National Statistics, Crown copyright and database right, under the Open Government Licence v3.0.",
    ),
  );
}

function group(title: string, items: CouncilView[]): HTMLElement {
  return el(
    "section",
    { class: "group" },
    el("h3", {}, `${title} (${items.length})`),
    el("ul", {}, ...items.map((v) => el("li", { class: `c-${v.availability}` }, v.name))),
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
    for (const availability of ORDER) {
      const items = shown.filter((v) => v.availability === availability);
      if (items.length === 0) continue;
      if (availability === "none") {
        const details = el("details", {}, el("summary", {}, `${LABELS.none} (${items.length})`), el("ul", {}, ...items.map((v) => el("li", { class: "c-none" }, v.name))));
        if (searching) details.setAttribute("open", "");
        pieces.push(details);
      } else {
        pieces.push(group(LABELS[availability], items));
      }
    }
    if (pieces.length === 0) pieces.push(el("p", { class: "note" }, "No council matches that name."));
    results.replaceChildren(...pieces);
  }
  search.addEventListener("input", render);
  render();
  return panel;
}

function buildMap(views: CouncilView[], shapes: Shapes | null): HTMLElement {
  const panel = el("div", { role: "tabpanel", id: "coverage-map", "aria-labelledby": "coverage-tab-map" });
  if (shapes === null) {
    panel.append(el("p", { class: "note" }, "The map didn't load. The list shows the same information."));
    return panel;
  }
  const byCode = new Map(views.map((v) => [v.code, v]));
  const info = el("p", { class: "map-info", "aria-live": "polite" }, "Tap a council to see its status.");

  const svg = svgEl("svg", { viewBox: shapes.viewBox, class: "map", role: "img", "aria-label": "Map of councils in Great Britain and Northern Ireland, coloured by whether we cover them. The list shows the same information." });
  const defs = svgEl("defs");
  const pattern = svgEl("pattern", { id: "soon-stripes", width: "8", height: "8", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pattern.append(svgEl("rect", { width: "8", height: "8", class: "stripe-bg" }), svgEl("rect", { width: "3", height: "8", class: "stripe-fg" }));
  defs.append(pattern);
  svg.append(defs);

  for (const shape of shapes.councils) {
    const view = byCode.get(shape.code);
    const path = svgEl("path", { d: shape.d, class: `c-${view?.availability ?? "none"}`, "data-code": shape.code });
    const title = svgEl("title");
    title.textContent = view ? `${view.name}: ${LABELS[view.availability]}` : shape.name;
    path.append(title);
    svg.append(path);
  }
  // A ring round every council we have any work on, so a small one isn't lost on a map of the whole country.
  for (const shape of shapes.councils) {
    const availability = byCode.get(shape.code)?.availability;
    const centre = availability && availability !== "none" ? centreOf(shape.d) : null;
    if (centre) svg.append(svgEl("circle", { cx: String(centre.x), cy: String(centre.y), r: "9", class: `ring r-${availability}`, "pointer-events": "none" }));
  }

  let selected: Element | null = null;
  svg.addEventListener("click", (event) => {
    const path = (event.target as Element).closest("path");
    const view = path ? byCode.get(path.getAttribute("data-code") ?? "") : undefined;
    if (!path || !view) return;
    selected?.classList.remove("selected");
    path.classList.add("selected");
    selected = path;
    info.textContent = describe(view);
  });

  const legend = el(
    "ul",
    { class: "legend" },
    ...ORDER.map((availability) => el("li", {}, el("span", { class: `swatch c-${availability}`, "aria-hidden": "true" }), LABELS[availability])),
  );
  panel.append(info, svg, legend);
  return panel;
}
