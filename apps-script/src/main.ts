import { buildCalendar, pocEvents } from "./ics";
import { feedFor, FEED_TOKEN } from "./feed";
import { parseBankHolidays, parseLearnedFrequencies, setBankHolidays, setCouncils, setLearnedFrequencies, slimCouncils } from "./registry";
import { type Remote, loadJson } from "./remote";
import { handle } from "./service";
import { sheetTables } from "./sheets";

const DEFAULT_REPO = "nialltm-bit/bin-day";
const REGISTRY_SECONDS = 600; // a change to the council list reaches the script within about ten minutes
const BANK_HOLIDAY_SECONDS = 3600;

function rawUrl(path: string): string {
  const repo = PropertiesService.getScriptProperties().getProperty("GITHUB_REPO");
  const name = repo && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo) ? repo : DEFAULT_REPO;
  return `https://raw.githubusercontent.com/${name}/main/${path}`;
}

const remote: Remote = {
  fetchText(url) {
    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      return response.getResponseCode() === 200 ? response.getContentText() : null;
    } catch {
      return null;
    }
  },
  cacheGet: (key) => CacheService.getScriptCache().get(key),
  cachePut(key, value, seconds) {
    try {
      CacheService.getScriptCache().put(key, value, seconds);
    } catch {
      // A full or unavailable cache only means the next request fetches again.
    }
  },
};

/**
 * Uses the live council list and bank holidays from GitHub, so adding councils needs no redeploy. The copies bundled into
 * the script are the fallback, used if GitHub can't be reached or the file doesn't pass the checks. Never throws.
 */
function refreshData(): void {
  try {
    const councils = loadJson(remote, "registry", rawUrl("registry/councils.json"), slimCouncils, REGISTRY_SECONDS);
    if (councils) setCouncils(councils);
    const learned = loadJson(remote, "learned", rawUrl("registry/learned-frequencies.json"), parseLearnedFrequencies, REGISTRY_SECONDS);
    if (learned) setLearnedFrequencies(learned);
    const holidays = loadJson(remote, "bankholidays", rawUrl("registry/bank-holidays.json"), parseBankHolidays, BANK_HOLIDAY_SECONDS);
    if (holidays) setBankHolidays(holidays);
  } catch (error) {
    console.error(`Using the bundled council list: ${error instanceof Error ? error.name : "error"}`);
  }
}

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
    refreshData();
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

const MAX_FETCH_REQUESTS_PER_HOUR = 20;
const MAX_CONTACT_MESSAGES_PER_HOUR = 20;

/** True and counts it while fewer than the hourly limit of contact-form messages have been accepted this hour. */
function contactAllowed(): boolean {
  const properties = PropertiesService.getScriptProperties();
  const key = `contact_messages_${Utilities.formatDate(new Date(), "UTC", "yyyyMMddHH")}`;
  const used = Number(properties.getProperty(key)) || 0;
  if (used >= MAX_CONTACT_MESSAGES_PER_HOUR) return false;
  properties.setProperty(key, String(used + 1));
  return true;
}

/**
 * Asks GitHub to run the "Fetch (scheduled)" workflow, and returns GitHub's status code (204 means it was accepted), or
 * null if the script isn't set up for it. The workflow takes no inputs (its inputs would be public) and fetches whatever
 * is due, which includes every address nobody has fetched yet. Needs the GITHUB_TOKEN script property (a token that may
 * run Actions on this one repository) and GITHUB_REPO ("owner/name").
 */
function dispatchFetch(): number | null {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty("GITHUB_TOKEN");
  const repo = properties.getProperty("GITHUB_REPO");
  if (!token || !repo || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) return null;
  const response = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/actions/workflows/fetch-scheduled.yml/dispatches`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    payload: JSON.stringify({ ref: "main" }),
    muteHttpExceptions: true,
  });
  return response.getResponseCode();
}

/**
 * Called when a sign-up adds a new address. Without the setup above it does nothing and the daily run still fetches the
 * address. Capped per hour so the public sign-up can't be used to flood Actions. Never throws, and logs only a status
 * code (the log is private to the script's owner, but there is no reason to put anything else in it).
 */
function requestFetch(): void {
  try {
    const properties = PropertiesService.getScriptProperties();
    const key = `fetch_requests_${Utilities.formatDate(new Date(), "UTC", "yyyyMMddHH")}`;
    const used = Number(properties.getProperty(key)) || 0;
    if (used >= MAX_FETCH_REQUESTS_PER_HOUR) return;
    properties.setProperty(key, String(used + 1));
    const code = dispatchFetch();
    if (code !== null && code !== 204) console.error(`Asking GitHub for a fetch failed: HTTP ${code}`);
  } catch (error) {
    console.error(`Asking GitHub for a fetch failed: ${error instanceof Error ? error.name : "error"}`);
  }
}

/**
 * For the script's owner to run once from the editor (Run, then testFetchRequest) after setting GITHUB_TOKEN and
 * GITHUB_REPO. It asks for a fetch and logs the answer: 204 is success. The first run also asks for the permission to
 * connect to an external service, which the sign-up needs.
 */
function testFetchRequest(): void {
  const code = dispatchFetch();
  console.log(code === null ? "Not set up: add the GITHUB_TOKEN and GITHUB_REPO script properties." : `GitHub answered HTTP ${code} (204 means the fetch was requested).`);
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
    refreshData();
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
        todayIso: () => Utilities.formatDate(new Date(), "Europe/London", "yyyy-MM-dd"),
        requestFetch,
        contactAllowed,
        maxSubscriptions: max > 0 ? max : undefined,
      }),
    );
  }
  // Anything else is the proof-of-concept echo used by the Pages test page.
  return json({ ok: true, received: body });
}

// The bundle is wrapped in a function, but Apps Script finds its entry points by name at the top level, and the editor's
// Run list only shows functions declared there. build.mjs adds plain top-level functions that call these.
Object.assign(globalThis, { __binDay: { doGet, doPost, testFetchRequest } });
