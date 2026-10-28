import { describe, expect, it } from "vitest";
import { GUIDES, detectDevice, orderFor } from "./calendar-guide";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";

describe("detectDevice", () => {
  it("recognises Apple, Android and Windows devices and calls anything else other", () => {
    expect(detectDevice(IPHONE)).toBe("apple");
    expect(detectDevice(MAC)).toBe("apple");
    expect(detectDevice(ANDROID)).toBe("android");
    expect(detectDevice(WINDOWS)).toBe("windows");
    expect(detectDevice(LINUX)).toBe("other");
    expect(detectDevice("")).toBe("other");
  });
});

describe("orderFor", () => {
  it("puts the calendar that suits the device first and still offers the other two", () => {
    expect(orderFor("apple")).toEqual(["apple", "google", "outlook"]);
    expect(orderFor("android")).toEqual(["google", "apple", "outlook"]);
    expect(orderFor("windows")).toEqual(["outlook", "google", "apple"]);
    expect(orderFor("other")).toEqual(["google", "apple", "outlook"]);
    for (const device of ["apple", "android", "windows", "other"] as const) expect([...orderFor(device)].sort()).toEqual(["apple", "google", "outlook"]);
  });
});

describe("the guides", () => {
  it("each end with the night-before notification, in the calendar's own words", () => {
    expect(GUIDES.google.steps.join(" ")).toContain("1 day before at 6:00pm");
    expect(GUIDES.apple.steps.join(" ")).toContain("6pm the evening before");
    expect(GUIDES.outlook.steps.join(" ")).toContain("6pm the evening before");
  });
  it("say plainly that Google ignores the built-in reminder, so the step is needed", () => {
    expect(GUIDES.google.steps.join(" ")).toMatch(/Google ignores reminders/);
  });
  it("are short: no more than four steps each", () => {
    for (const guide of Object.values(GUIDES)) expect(guide.steps.length).toBeLessThanOrEqual(4);
  });
  it("name each calendar's add button", () => {
    expect(Object.values(GUIDES).map((g) => g.button)).toEqual(["Add to Google Calendar", "Add to Apple Calendar", "Add to Outlook"]);
  });
});
