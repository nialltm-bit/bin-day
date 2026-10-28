import "./style.css";
import { addGoatCounter } from "./analytics";
import councilData from "../../registry/councils.json";
import type { CouncilEntry } from "./coverage";
import { mountCoverage } from "./coverage-view";
import { mountLookup } from "./lookup-view";
import { statusMessage } from "./status";

addGoatCounter(import.meta.env.VITE_GOATCOUNTER_URL);

const status = document.getElementById("status");
if (status) {
  status.textContent = statusMessage();
}

const registry = (councilData as { councils: CouncilEntry[] }).councils;

const lookupRoot = document.getElementById("lookup");
if (lookupRoot) {
  // The script's address is public (it is how the page talks to it), so it is set at build time, not kept secret.
  mountLookup(lookupRoot, { registry, scriptUrl: import.meta.env.VITE_SCRIPT_URL || undefined });
}

const coverage = document.getElementById("coverage");
if (coverage) {
  void mountCoverage(coverage, {
    registry,
    loadShapes: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/council-shapes.json`);
      if (!response.ok) throw new Error("outlines not available");
      return response.json();
    },
  });
}
