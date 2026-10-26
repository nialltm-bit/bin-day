import { buildCalendar, pocEvents } from "./ics";

function json(body: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  if (e?.parameter?.feed === "poc") {
    const now = new Date();
    const today = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
    const calendar = buildCalendar("Bin Day PoC", pocEvents(today), now);
    return ContentService.createTextOutput(calendar).setMimeType(ContentService.MimeType.ICAL);
  }
  return json({ ok: true, service: "bin-day-poc", time: new Date().toISOString() });
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    return json({ ok: true, received: JSON.parse(e?.postData?.contents ?? "null") });
  } catch {
    return json({ ok: false, error: "body is not JSON" });
  }
}

// Apps Script looks for top-level functions by name, so expose them on the global object.
Object.assign(globalThis, { doGet, doPost });
