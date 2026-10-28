import "./style.css";
import councilData from "../../registry/councils.json";
import type { CouncilEntry } from "./coverage";
import { mountCoverage } from "./coverage-view";
import { statusMessage } from "./status";

const status = document.getElementById("status");
if (status) {
  status.textContent = statusMessage();
}

const coverage = document.getElementById("coverage");
if (coverage) {
  void mountCoverage(coverage, {
    registry: (councilData as { councils: CouncilEntry[] }).councils,
    loadShapes: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/council-shapes.json`);
      if (!response.ok) throw new Error("outlines not available");
      return response.json();
    },
  });
}
