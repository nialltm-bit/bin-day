import { describe, expect, it } from "vitest";
import { GOOGLE_REMINDER, NAMES, detectDevice, orderFor } from "./add-to-calendar";

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

describe("the words", () => {
  it("name each calendar", () => {
    expect(NAMES).toEqual({ google: "Google Calendar", apple: "Apple Calendar", outlook: "Outlook" });
  });
  it("tell a Google user the reminder is theirs to set, in one sentence pair", () => {
    expect(GOOGLE_REMINDER).toMatch(/^Google Calendar/);
    expect(GOOGLE_REMINDER).toMatch(/notification/);
    expect(GOOGLE_REMINDER.length).toBeLessThan(100);
  });
});
