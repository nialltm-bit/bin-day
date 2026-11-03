import "./style.css";
import councilData from "../../registry/councils.json";
import { addGoatCounter } from "./analytics";
import type { CouncilEntry } from "./coverage";
import { mountCoverage } from "./coverage-view";

addGoatCounter(import.meta.env.VITE_GOATCOUNTER_URL);

const root = document.getElementById("coverage");
if (root) {
  void mountCoverage(root, {
    registry: (councilData as { councils: CouncilEntry[] }).councils,
    loadShapes: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/council-shapes.json`);
      if (!response.ok) throw new Error("outlines not available");
      return response.json();
    },
  });
}
