/** The "Find your bin days" form: postcode, then (where we can help) the house, garden waste, and the button. */
import { type CouncilEntry, type Outcome, lookup, messageFor } from "./coverage";
import { el } from "./dom";
import { type Ask, type Ready, calendarLinks, checkHouse, explain, post, subscribeBody } from "./signup";

export interface LookupOptions {
  registry: CouncilEntry[];
  /** The script's web app address. Without it, finding the council works but making a calendar feed doesn't. */
  scriptUrl?: string;
  fetch?: typeof fetch;
  canFindUprn?: boolean;
}

export function mountLookup(root: HTMLElement, options: LookupOptions): void {
  const fetchFn = options.fetch ?? fetch.bind(globalThis);

  const postcode = el("input", { id: "postcode", name: "postcode", type: "text", autocomplete: "postal-code", inputmode: "text", maxlength: "9", required: "" });
  const check = el("button", { type: "submit" }, "Check postcode");
  const form = el(
    "form",
    { id: "postcode-form", novalidate: "" },
    el("label", { for: "postcode" }, "Your postcode"),
    el("div", { class: "row" }, postcode, check),
  );
  const message = el("div", { id: "lookup-message", "aria-live": "polite" });
  const details = el("div", { id: "lookup-details" });
  const result = el("div", { id: "lookup-result", "aria-live": "polite" });
  root.replaceChildren(el("h2", { id: "lookup-title" }, "Find your bin days"), form, message, details, result);

  function reset(): void {
    message.replaceChildren();
    details.replaceChildren();
    result.replaceChildren();
  }
  postcode.addEventListener("input", reset);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run();
  });

  async function run(): Promise<void> {
    reset();
    check.disabled = true;
    message.replaceChildren(el("p", { class: "note" }, "Checking…"));
    const outcome = await lookup(postcode.value, { fetch: fetchFn, councils: options.registry, canFindUprn: options.canFindUprn });
    check.disabled = false;
    show(outcome);
  }

  function show(outcome: Outcome): void {
    const text = messageFor(outcome);
    const pieces: HTMLElement[] = [el("h3", {}, text.headline), el("p", {}, text.detail)];
    if (text.help) pieces.push(el("p", {}, el("a", { href: text.help.url, rel: "noopener" }, text.help.label)));
    if (text.waitlist) pieces.push(countButton(text.waitlist.ons_code));
    message.replaceChildren(...pieces);
    if (outcome.kind === "ready" && outcome.ask !== "address_list") showDetails(outcome, outcome.ask);
  }

  /** Adds this person to the count for a council we don't cover. Only the council code is sent. */
  function countButton(onsCode: string): HTMLElement {
    const status = el("p", { class: "note", role: "status" });
    const button = el("button", { type: "button", class: "secondary" }, "Add my council to the count");
    button.addEventListener("click", () => {
      if (!options.scriptUrl) {
        status.textContent = "Counting isn't switched on yet.";
        return;
      }
      button.disabled = true;
      void post(options.scriptUrl, { action: "join_waitlist", ons_code: onsCode }, fetchFn).then((reply) => {
        status.textContent = reply.ok ? "Thanks, your council is counted." : explain(reply.error);
        if (!reply.ok) button.disabled = false;
      });
    });
    return el("div", { class: "count" }, button, status);
  }

  function showDetails(outcome: Ready, ask: Ask): void {
    const house = el("input", {
      id: "house",
      name: "house",
      type: "text",
      autocomplete: "address-line1",
      maxlength: "100",
      required: "",
      placeholder: ask === "first_line" ? "12 High Street" : "12 or Rose Cottage",
    });
    const houseError = el("p", { class: "error", id: "house-error", role: "alert" });
    house.setAttribute("aria-describedby", "house-error");

    const garden = el(
      "fieldset",
      {},
      el("legend", {}, "Do you have a garden waste bin?"),
      el("label", { class: "choice" }, el("input", { type: "radio", name: "garden", value: "yes" }), " Yes"),
      el("label", { class: "choice" }, el("input", { type: "radio", name: "garden", value: "no" }), " No"),
    );
    const gardenError = el("p", { class: "error", id: "garden-error", role: "alert" });
    const submit = el("button", { type: "submit" }, "Show my bin days");

    const detailsForm = el(
      "form",
      { novalidate: "" },
      el("label", { for: "house" }, ask === "first_line" ? "First line of your address" : "House number or name"),
      house,
      houseError,
      garden,
      gardenError,
      submit,
    );
    details.replaceChildren(detailsForm);
    house.focus();

    detailsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      houseError.textContent = "";
      gardenError.textContent = "";
      const checked = checkHouse(house.value, ask);
      const picked = detailsForm.querySelector<HTMLInputElement>('input[name="garden"]:checked');
      if (!checked.ok) {
        houseError.textContent = checked.error;
        house.focus();
        return;
      }
      if (!picked) {
        gardenError.textContent = "Choose yes or no.";
        return;
      }
      void subscribe(outcome, checked.value, picked.value === "yes", submit);
    });
  }

  async function subscribe(outcome: Ready, house: string, garden: boolean, submit: HTMLButtonElement): Promise<void> {
    result.replaceChildren();
    if (!options.scriptUrl) {
      result.replaceChildren(el("p", { class: "error", role: "alert" }, "Calendar links aren't switched on yet. Please check back soon."));
      return;
    }
    submit.disabled = true;
    result.replaceChildren(el("p", { class: "note" }, "Making your calendar link…"));
    const reply = await post(options.scriptUrl, subscribeBody(outcome, house, garden), fetchFn);
    submit.disabled = false;
    if (!reply.ok || !reply.token) {
      result.replaceChildren(el("p", { class: "error", role: "alert" }, reply.ok ? explain("unknown") : explain(reply.error)));
      return;
    }
    const links = calendarLinks(options.scriptUrl, reply.token);
    if (!links) {
      result.replaceChildren(el("p", { class: "error", role: "alert" }, explain("unknown")));
      return;
    }
    result.replaceChildren(done(links, outcome.name));
    result.scrollIntoView?.({ block: "nearest" });
  }
}

function done(links: ReturnType<typeof calendarLinks> & object, council: string): HTMLElement {
  const copy = el("input", { type: "text", readonly: "", value: links.https, "aria-label": "Your private calendar link", class: "copy" });
  copy.addEventListener("focus", () => copy.select());
  return el(
    "section",
    { class: "done" },
    el("h3", {}, "Your calendar link is ready"),
    el("p", {}, `We fetch ${council}'s bin days overnight, so your calendar fills in within a day. After that it updates itself when collections move.`),
    el(
      "p",
      { class: "buttons" },
      el("a", { class: "button", href: links.google, rel: "noopener" }, "Add to Google Calendar"),
      el("a", { class: "button", href: links.apple }, "Add to Apple Calendar"),
      el("a", { class: "button", href: links.outlook, rel: "noopener" }, "Add to Outlook"),
    ),
    el("p", {}, "Or copy the link into any calendar app that can subscribe to a calendar by link:"),
    copy,
    el("p", { class: "note" }, "This link is private to you. Anyone who has it can see your bin days, so don't post it."),
    el(
      "p",
      { class: "note" },
      "Google Calendar ignores reminders on subscribed calendars. To get a reminder, turn on notifications for this calendar in Google Calendar's settings.",
    ),
  );
}
