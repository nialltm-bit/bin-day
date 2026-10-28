import "./style.css";
import { addGoatCounter } from "./analytics";
import { mountContactForm } from "./contact-form";
import { mountDeleteFeed } from "./delete-feed";

addGoatCounter(import.meta.env.VITE_GOATCOUNTER_URL);

// The script's address is public (it is how the page talks to it), so it is set at build time, not kept secret.
const scriptUrl = import.meta.env.VITE_SCRIPT_URL || undefined;
const root = document.getElementById("delete-feed");
if (root) mountDeleteFeed(root, { scriptUrl });
const contact = document.getElementById("contact-form");
if (contact) mountContactForm(contact, { scriptUrl });
