import { buildCalendar, pocEvents } from "./ics";
import { feedFor, FEED_TOKEN } from "./feed";
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
  const token = e?.parameter?.feed;
  if (token && token !== "poc") {
    const now = new Date();
    const today = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
    const calendar = FEED_TOKEN.test(token) ? feedFor(token, { tables: sheetTables, now, today }) : null;
    if (calendar === null) return json({ ok: false, error: "not found" });
    return ContentService.createTextOutput(calendar).setMimeType(ContentService.MimeType.ICAL);
  }
  return json({ ok: true, service: "bin-day", time: new Date().toISOString() });
}

/** `parts` UUIDs of hex, so 32 hex characters per part. */
function randomHex(parts: number): string {
  let hex = "";
  for (let i = 0; i < parts; i++) hex += Utilities.getUuid().replace(/-/g, "");
  return hex;
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
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty("FETCHER_SECRET") ?? undefined;
    const max = Number(properties.getProperty("MAX_SUBSCRIPTIONS"));
    return json(
      handle(body, {
        secret,
        tables: sheetTables,
        withLock: withScriptLock,
        newToken: () => randomHex(2),
        newId: () => randomHex(1).slice(0, 8),
        nowIso: () => new Date().toISOString(),
        maxSubscriptions: max > 0 ? max : undefined,
      }),
    );
  }
  // Anything else is the proof-of-concept echo used by the Pages test page.
  return json({ ok: true, received: body });
}

// Apps Script looks for top-level functions by name, so expose them on the global object.
Object.assign(globalThis, { doGet, doPost });
