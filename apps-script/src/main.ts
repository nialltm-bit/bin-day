import { buildCalendar, pocEvents } from "./ics";
import { handle } from "./service";
import { sheetTables } from "./sheets";

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

function withScriptLock<T>(work: () => T): T {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  let body: unknown;
  try {
    body = JSON.parse(e?.postData?.contents ?? "null");
  } catch {
    return json({ ok: false, error: "body is not JSON" });
  }
  // Requests with an action are the fetcher's store API and need the shared secret.
  if (typeof body === "object" && body !== null && "action" in body) {
    const secret = PropertiesService.getScriptProperties().getProperty("FETCHER_SECRET") ?? undefined;
    return json(handle(body, { secret, tables: sheetTables, withLock: withScriptLock }));
  }
  // Anything else is the proof-of-concept echo used by the Pages test page.
  return json({ ok: true, received: body });
}

// Apps Script looks for top-level functions by name, so expose them on the global object.
Object.assign(globalThis, { doGet, doPost });
