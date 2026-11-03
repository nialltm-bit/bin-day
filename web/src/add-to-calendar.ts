/**
 * The add-to-calendar actions: the calendar most likely to suit this device as the one button, the others as links.
 *
 * Apple and Outlook take the night-before alert from the feed itself. Google ignores alerts in subscribed calendars, so
 * a Google user has to add the notification by hand: that is the one line of guidance the page keeps.
 */
import { el } from "./dom";
import type { CalendarLinks } from "./signup";

export type Calendar = "google" | "apple" | "outlook";

export const NAMES: Record<Calendar, string> = { google: "Google Calendar", apple: "Apple Calendar", outlook: "Outlook" };

export const GOOGLE_REMINDER = "Google Calendar won't remind you on its own. Add a notification in the calendar's settings.";

export type Device = "apple" | "android" | "windows" | "other";

/** What kind of device this probably is, from the browser's own description. Only a guess, so every calendar stays on offer. */
export function detectDevice(userAgent: string): Device {
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent)) return "apple";
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows/i.test(userAgent)) return "windows";
  return "other";
}

/** The calendars in the order to show them: the one most likely to suit this device first. */
export function orderFor(device: Device): Calendar[] {
  switch (device) {
    case "apple":
      return ["apple", "google", "outlook"];
    case "windows":
      return ["outlook", "google", "apple"];
    default:
      return ["google", "apple", "outlook"];
  }
}

function link(calendar: Calendar, links: CalendarLinks, attrs: Record<string, string>, text: string): HTMLAnchorElement {
  // Apple's link is webcal:, which the device hands to its calendar app, so it has no window to open.
  return el("a", { ...attrs, href: links[calendar], ...(calendar === "apple" ? {} : { rel: "noopener" }) }, text);
}

export function addToCalendar(links: CalendarLinks, device: Device): HTMLElement {
  const [first, ...rest] = orderFor(device);
  const copy = el("button", { type: "button", class: "link" }, "Copy link");
  copy.addEventListener("click", () => {
    const done = () => (copy.textContent = "Copied");
    // Without clipboard access, show the link so it can be copied by hand.
    const fallback = () => window.prompt("Your calendar link", links.https);
    if (navigator.clipboard) void navigator.clipboard.writeText(links.https).then(done, fallback);
    else fallback();
  });
  return el(
    "div",
    { class: "add" },
    link(first, links, { class: "button" }, `Add to ${NAMES[first]}`),
    el("p", { class: "others" }, ...rest.map((calendar) => link(calendar, links, {}, NAMES[calendar])), copy),
    el("p", { class: "note" }, GOOGLE_REMINDER),
  );
}
