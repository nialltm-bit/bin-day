/**
 * The calendar setup guide (FRE-273): the buttons that add the feed to Google, Apple or Outlook calendar, and a short
 * guide for each that ends with the night-before notification. The guide for the person's own device comes first.
 *
 * Every step here is written from how those calendars are documented to work; none of it has been tried on a live
 * account yet (see docs/lookup-page.md), so check each one before launch.
 */
import { el } from "./dom";
import type { CalendarLinks } from "./signup";

export type Calendar = "google" | "apple" | "outlook";

export interface Guide {
  calendar: Calendar;
  name: string;
  /** The words on the add button. */
  button: string;
  /** What to do after the button: the steps, then what to expect. */
  steps: string[];
  /** Said plainly where the calendar might not do what we'd like. */
  caution?: string;
}

export const GUIDES: Record<Calendar, Guide> = {
  google: {
    calendar: "google",
    name: "Google Calendar",
    button: "Add to Google Calendar",
    steps: [
      "Tap or click Add to Google Calendar above, sign in if asked, then confirm Add calendar. If that doesn't work, open Google Calendar on a computer, choose + next to Other calendars, then From URL, and paste your link.",
      "Turn on your night-before notification. In Google Calendar on a computer (calendar.google.com), open Settings (the cog), find this calendar under Settings for other calendars and click it.",
      "Under All-day event notifications choose Add a notification, set it to 1 day before at 6:00pm, and make sure the type is Notification. (Google ignores reminders that come with a subscribed calendar, so this step is what gives you the reminder.)",
      "On your phone, open the Google Calendar app signed in with the same Google account, and check this calendar is ticked in the menu. Your notification setting normally follows you to your phone.",
    ],
    caution: "Google can take a few hours to show a newly added calendar, and refreshes subscribed calendars on its own schedule, so a moved collection can take a while to appear.",
  },
  apple: {
    calendar: "apple",
    name: "Apple Calendar (iPhone, iPad, Mac)",
    button: "Add to Apple Calendar",
    steps: [
      "Tap or click Add to Apple Calendar above and choose Subscribe when your device asks. Leave the settings as they are and tap or click Done.",
      "Your reminder is built in: each bin day comes with an alert at 6pm the evening before. You don't need to set anything up.",
      "If you don't get the alert, on an iPhone or iPad open Settings, then Calendar, Accounts, Subscribed Calendars, choose this calendar and make sure Remove Alerts is off. Also check notifications are on for Calendar in Settings, Notifications.",
    ],
    caution: "Apple refreshes subscribed calendars every so often (you can change how often in the same Subscribed Calendars settings).",
  },
  outlook: {
    calendar: "outlook",
    name: "Outlook",
    button: "Add to Outlook",
    steps: [
      "Tap or click Add to Outlook above, sign in to your Microsoft account if asked, and confirm the calendar's name and link, then choose Import.",
      "Each bin day carries an alert at 6pm the evening before. Check the first one arrives: Outlook doesn't always show alerts that come with a subscribed calendar.",
      "If the alert doesn't arrive, Google Calendar or Apple Calendar will give you the reminder more reliably. You can have the same bin days in more than one calendar.",
    ],
    caution: "Outlook is the one we are least sure about for reminders. Tell us if it doesn't work for you.",
  },
};

export type Device = "apple" | "android" | "windows" | "other";

/** What kind of device this probably is, from the browser's own description. Only a guess, so every guide stays on the page. */
export function detectDevice(userAgent: string): Device {
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent)) return "apple";
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows/i.test(userAgent)) return "windows";
  return "other";
}

/** The calendars in the order to show them: the one most likely to suit this device first, the others after. */
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

function addLink(guide: Guide, links: CalendarLinks, first: boolean): HTMLElement {
  const href = links[guide.calendar];
  const attrs: Record<string, string> = { class: first ? "button" : "button secondary", href };
  if (guide.calendar !== "apple") attrs.rel = "noopener";
  return el("a", attrs, guide.button);
}

/** The add buttons and the guides, in order for this device. The first guide starts open. */
export function calendarSection(links: CalendarLinks, device: Device): HTMLElement {
  const order = orderFor(device);
  const guides = order.map((calendar, index) => {
    const guide = GUIDES[calendar];
    const details = el(
      "details",
      { class: "guide" },
      el("summary", {}, `${index === 0 ? "Set up " : ""}${guide.name}`),
      el("ol", {}, ...guide.steps.map((step) => el("li", {}, step))),
      ...(guide.caution ? [el("p", { class: "note" }, guide.caution)] : []),
    );
    if (index === 0) details.setAttribute("open", "");
    return details;
  });
  return el(
    "div",
    { class: "calendar-setup" },
    el("h4", {}, "Add it to your calendar"),
    el("p", { class: "buttons" }, ...order.map((calendar, index) => addLink(GUIDES[calendar], links, index === 0))),
    el("p", { class: "note" }, "Pick the calendar you already use. The steps below also set up the reminder for the evening before each collection."),
    ...guides,
    el("p", {}, "Using another calendar app? Copy the link below into its Subscribe by link option, then set a notification for that calendar for the evening before."),
  );
}
