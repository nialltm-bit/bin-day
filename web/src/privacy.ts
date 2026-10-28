import "./style.css";
import { mountDeleteFeed } from "./delete-feed";

const root = document.getElementById("delete-feed");
if (root) {
  // The script's address is public (it is how the page talks to it), so it is set at build time, not kept secret.
  mountDeleteFeed(root, { scriptUrl: import.meta.env.VITE_SCRIPT_URL || undefined });
}
