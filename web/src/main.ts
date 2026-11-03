import "./style.css";
import councilData from "../../registry/councils.json";
import { addGoatCounter } from "./analytics";
import type { CouncilEntry } from "./coverage";
import { mountLookup } from "./lookup-view";

addGoatCounter(import.meta.env.VITE_GOATCOUNTER_URL);

const root = document.getElementById("lookup");
if (root) {
  // The script's address is public (it is how the page talks to it), so it is set at build time, not kept secret.
  mountLookup(root, { registry: (councilData as { councils: CouncilEntry[] }).councils, scriptUrl: import.meta.env.VITE_SCRIPT_URL || undefined });
}
