/** The lookup: postcode, then the house and garden waste, then the next collections and a way into the person's calendar. */
import { addToCalendar, detectDevice } from "./add-to-calendar";
import { type CouncilEntry, type Outcome, type Stop, houseLabel, lookup, messageFor } from "./coverage";
import { el } from "./dom";
import { type Ask, type Ready, calendarLinks, checkHouse, explain, formatDay, pollUpcoming, post, subscribeBody, type UpcomingState } from "./signup";

export interface LookupOptions {
  registry: CouncilEntry[];
  /** The script's web app address. Without it, finding the council works but making a calendar feed doesn't. */
  scriptUrl?: string;
  fetch?: typeof fetch;
  canFindUprn?: boolean;
  /** Replaceable so tests don't wait between asks for the dates. */
  sleep?: (ms: number) => Promise<void>;
}

const NOT_SWITCHED_ON = "Not switched on yet. Check back soon.";

export function mountLookup(root: HTMLElement, options: LookupOptions): void {
  const fetchFn = options.fetch ?? fetch.bind(globalThis);

  const postcode = el("input", {
    id: "postcode",
    name: "postcode",
    type: "text",
    autocomplete: "postal-code",
    autocapitalize: "characters",
    spellcheck: "false",
    maxlength: "9",
    required: "",
    placeholder: "Postcode",
    "aria-label": "Postcode",
  });
  const check = el("button", { type: "submit", "aria-label": "Find bin days" }, "→");
  const form = el("form", { id: "postcode-form", class: "field", novalidate: "" }, postcode, check);
  const message = el("div", { id: "lookup-message", "aria-live": "polite" });
  const details = el("div", { id: "lookup-details" });
  const result = el("div", { id: "lookup-result", "aria-live": "polite" });
  root.replaceChildren(form, message, details, result);
  postcode.focus();

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
    form.setAttribute("aria-busy", "true");
    const outcome = await lookup(postcode.value, { fetch: fetchFn, councils: options.registry, canFindUprn: options.canFindUprn });
    check.disabled = false;
    form.removeAttribute("aria-busy");
    show(outcome);
  }

  function show(outcome: Outcome): void {
    // An address picker isn't built yet, so a council that needs one is told the same as one we can't reach addresses in.
    if (outcome.kind === "ready" && outcome.ask !== "address_list") return showDetails(outcome, outcome.ask);
    const stop: Stop = outcome.kind === "ready" ? { ...outcome, kind: "council_needs_address_lookup" } : outcome;
    const text = messageFor(stop);
    const pieces: HTMLElement[] = [el("p", {}, text.text)];
    const actions: HTMLElement[] = [];
    if (text.waitlist) actions.push(countButton(text.waitlist.ons_code, text.waitlist.name));
    if (text.help) actions.push(el("a", { href: text.help.url, rel: "noopener" }, text.help.label));
    if (actions.length) pieces.push(el("p", { class: "others" }, ...actions));
    message.replaceChildren(...pieces);
  }

  /** Adds this person to the count for a council we don't cover. Only the council code is sent. */
  function countButton(onsCode: string, name: string): HTMLElement {
    const button = el("button", { type: "button", class: "link" }, `Vote for ${name}`);
    button.addEventListener("click", () => {
      if (!options.scriptUrl) {
        button.textContent = NOT_SWITCHED_ON;
        return;
      }
      button.disabled = true;
      void post(options.scriptUrl, { action: "join_waitlist", ons_code: onsCode }, fetchFn).then((reply) => {
        button.textContent = reply.ok ? "Counted" : explain(reply.error);
        if (!reply.ok) button.disabled = false;
      });
    });
    return button;
  }

  function showDetails(outcome: Ready, ask: Ask): void {
    const label = houseLabel(ask);
    const house = el("input", {
      id: "house",
      name: "house",
      type: "text",
      autocomplete: "address-line1",
      maxlength: "100",
      required: "",
      placeholder: label,
      "aria-label": label,
      "aria-describedby": "house-error",
    });
    const houseError = el("p", { class: "error", id: "house-error", role: "alert" });
    // No default: a wrong default would hide a bin someone has.
    const pill = (value: string, text: string) => el("label", {}, el("input", { type: "radio", name: "garden", value }), text);
    const garden = el("fieldset", { class: "choice", "aria-describedby": "garden-error" }, el("legend", {}, "Garden waste bin"), el("span", {}, pill("yes", "Yes"), pill("no", "No")));
    const gardenError = el("p", { class: "error", id: "garden-error", role: "alert" });
    const submit = el("button", { type: "submit" }, "Show bin days");
    const detailsForm = el(
      "form",
      { novalidate: "" },
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
      const picked = garden.querySelector<HTMLInputElement>("input:checked");
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
    if (!options.scriptUrl) {
      result.replaceChildren(el("p", { class: "error", role: "alert" }, NOT_SWITCHED_ON));
      return;
    }
    submit.disabled = true;
    result.replaceChildren(el("p", { class: "note" }, "Getting your bin days…"));
    const reply = await post(options.scriptUrl, subscribeBody(outcome, house, garden), fetchFn);
    submit.disabled = false;
    const links = reply.ok && reply.token ? calendarLinks(options.scriptUrl, reply.token) : null;
    if (!reply.ok || !reply.token || !links) {
      result.replaceChildren(el("p", { class: "error", role: "alert" }, explain(reply.ok ? "unknown" : reply.error)));
      return;
    }
    const dates = el("div", { class: "dates" }, el("p", { class: "note" }, "Getting your bin days…"));
    const add = addToCalendar(links, detectDevice(navigator.userAgent));
    result.replaceChildren(dates, add);
    const state = await pollUpcoming(options.scriptUrl, reply.token, { fetch: fetchFn, sleep: options.sleep });
    // The person may have started again while we waited; only write into the page they are still looking at.
    if (!dates.isConnected) return;
    dates.replaceChildren(showDates(state, outcome.name));
    // A feed for an address the council doesn't know would stay empty, so don't offer it.
    if (state.status === "failed") add.remove();
    result.scrollIntoView?.({ block: "nearest" });
  }
}

function showDates(state: UpcomingState, council: string): HTMLElement {
  if (state.status === "ready" && state.days.length > 0) {
    return el(
      "ul",
      { class: "days" },
      ...state.days.map((day) =>
        el(
          "li",
          day.projected ? { class: "expected" } : {},
          el("span", { class: "date" }, formatDay(day.date)),
          el("span", {}, day.label),
          ...(day.projected ? [el("span", { class: "sr-only" }, " (expected)")] : []),
        ),
      ),
    );
  }
  if (state.status === "ready") return el("p", {}, "No collections in the next few weeks.");
  if (state.status === "failed") return el("p", { class: "error", role: "alert" }, `${council} didn't recognise that address.`);
  return el("p", {}, "Taking longer than usual. Your calendar will fill in within a day.");
}
