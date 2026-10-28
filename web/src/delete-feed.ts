/** The "delete my calendar feed" control on the privacy page: finds the token in what was pasted and asks the script to delete it. */
import { el } from "./dom";
import { post } from "./signup";

/** The feed token in a pasted calendar link (https or webcal) or the bare token. Null if there isn't exactly one. */
export function tokenFrom(text: string): string | null {
  const found = text.toLowerCase().match(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/g);
  return found?.length === 1 ? found[0] : null;
}

export type DeleteResult = { kind: "deleted" } | { kind: "not_found" } | { kind: "bad_link" } | { kind: "error" };

export async function deleteFeed(scriptUrl: string, pasted: string, fetchFn: typeof fetch = fetch): Promise<DeleteResult> {
  const token = tokenFrom(pasted);
  if (token === null) return { kind: "bad_link" };
  const reply = await post(scriptUrl, { action: "unsubscribe", token }, fetchFn);
  if (reply.ok) return { kind: "deleted" };
  return reply.error === "not found" ? { kind: "not_found" } : { kind: "error" };
}

export function messageForDelete(result: DeleteResult): string {
  switch (result.kind) {
    case "deleted":
      return "Done. That calendar feed has been deleted and has stopped working. If nobody else uses the same address, the address and its bin dates have been deleted too. You can also remove the calendar from your calendar app.";
    case "not_found":
      return "We couldn't find that feed. It may already have been deleted.";
    case "bad_link":
      return "Paste your whole calendar link, the one you subscribed with. It contains a long string of 64 letters and numbers.";
    case "error":
      return "Something went wrong and nothing was deleted. Try again in a minute.";
  }
}

export interface DeleteOptions {
  scriptUrl?: string;
  fetch?: typeof fetch;
  /** Asks the person to confirm. Replaceable so tests don't open a dialog. */
  confirm?: (question: string) => boolean;
}

export function mountDeleteFeed(root: HTMLElement, options: DeleteOptions): void {
  const link = el("input", { id: "feed-link", name: "feed-link", type: "text", autocomplete: "off", spellcheck: "false", required: "" });
  const button = el("button", { type: "submit" }, "Delete my feed");
  const message = el("div", { id: "delete-message", "aria-live": "polite" });
  const form = el("form", { novalidate: "" }, el("label", { for: "feed-link" }, "Your calendar link"), el("div", { class: "row" }, link, button));
  root.replaceChildren(form, message);
  if (!options.scriptUrl) {
    message.replaceChildren(el("p", { class: "note" }, "Deleting from this page isn't switched on yet. Please ask us using the contact details at the bottom of this page."));
    button.disabled = true;
    return;
  }
  const scriptUrl = options.scriptUrl;
  const confirmFn = options.confirm ?? ((question: string) => window.confirm(question));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run();
  });
  async function run(): Promise<void> {
    if (tokenFrom(link.value) !== null && !confirmFn("Delete this calendar feed? It will stop working straight away. This can't be undone.")) return;
    button.disabled = true;
    message.replaceChildren(el("p", { class: "note" }, "Deleting…"));
    const result = await deleteFeed(scriptUrl, link.value, options.fetch ?? fetch.bind(globalThis));
    button.disabled = false;
    message.replaceChildren(el("p", {}, messageForDelete(result)));
    if (result.kind === "deleted") link.value = "";
  }
}
