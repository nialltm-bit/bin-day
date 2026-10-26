"use strict";
(() => {
  // src/ics.ts
  var CRLF = "\r\n";
  var VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/London",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0000",
    "TZOFFSETTO:+0100",
    "TZNAME:BST",
    "DTSTART:19700329T010000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0000",
    "TZNAME:GMT",
    "DTSTART:19701025T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];
  function escapeText(text2) {
    return text2.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  function utf8Length(char) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 128) return 1;
    if (code < 2048) return 2;
    if (code < 65536) return 3;
    return 4;
  }
  function foldLine(line) {
    const parts = [];
    let current = "";
    let bytes = 0;
    for (const char of line) {
      const size = utf8Length(char);
      const limit = parts.length === 0 ? 75 : 74;
      if (bytes + size > limit) {
        parts.push(current);
        current = "";
        bytes = 0;
      }
      current += char;
      bytes += size;
    }
    parts.push(current);
    return parts.join(CRLF + " ");
  }
  function compactDate(date) {
    return date.replace(/-/g, "");
  }
  function addMinutes(date, time, minutes) {
    const [hours, mins] = time.split(":").map(Number);
    const total = hours * 60 + mins + minutes;
    const dayShift = Math.floor(total / 1440);
    const rest = (total % 1440 + 1440) % 1440;
    return {
      date: addDays(date, dayShift),
      time: `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}`
    };
  }
  function addDays(date, days) {
    const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function stamp(now) {
    return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }
  function eventLines(event, now) {
    const lines = ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${stamp(now)}`];
    if (event.start.kind === "date") {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(event.start.date)}`);
      lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(event.start.date, 1))}`);
    } else {
      const { date, time, minutes } = event.start;
      const end = addMinutes(date, time, minutes);
      lines.push(`DTSTART;TZID=Europe/London:${compactDate(date)}T${time.replace(":", "")}00`);
      lines.push(`DTEND;TZID=Europe/London:${compactDate(end.date)}T${end.time.replace(":", "")}00`);
    }
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push("TRANSP:TRANSPARENT");
    if (event.alarm) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(event.summary)}`,
        `TRIGGER:${event.alarm}`,
        "END:VALARM"
      );
    }
    lines.push("END:VEVENT");
    return lines;
  }
  function buildCalendar(name, events, now) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Bin Day//Feed//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeText(name)}`,
      "X-WR-TIMEZONE:Europe/London",
      "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
      "X-PUBLISHED-TTL:PT12H",
      ...VTIMEZONE,
      ...events.flatMap((event) => eventLines(event, now)),
      "END:VCALENDAR"
    ];
    return lines.map(foldLine).join(CRLF) + CRLF;
  }
  function pocEvents(today) {
    const day = (/* @__PURE__ */ new Date(`${today}T00:00:00Z`)).getUTCDay();
    const firstTuesday = addDays(today, (2 - day + 7) % 7 || 7);
    const events = [];
    for (let week = 0; week < 3; week++) {
      const collection = addDays(firstTuesday, week * 7);
      events.push({
        uid: `poc-a-${collection}@bin-day`,
        summary: "PoC A: Bins: recycling + food",
        description: "All-day event on collection day, with an alarm at 6pm the day before.",
        start: { kind: "date", date: collection },
        alarm: "-PT6H"
      });
      events.push({
        uid: `poc-b-${collection}@bin-day`,
        summary: "PoC B: Bins out tonight: recycling + food",
        description: "Timed event at 6pm the day before collection.",
        start: { kind: "local", date: addDays(collection, -1), time: "18:00", minutes: 30 },
        alarm: "PT0S"
      });
    }
    events.push({
      uid: `poc-warning-${addDays(firstTuesday, 7)}@bin-day`,
      summary: "PoC: Bin days change next week, now Thursdays",
      start: { kind: "date", date: addDays(firstTuesday, 0) },
      alarm: "-PT6H"
    });
    return events;
  }

  // src/service.ts
  var STREAMS = ["general", "recycling", "food", "garden"];
  var UPRN = /^[0-9]{1,12}$/;
  var ONS_CODE = /^[ENSW][0-9]{8}$/;
  var TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$/;
  var DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  var MAX_TEXT = 500;
  function fail(error) {
    return { ok: false, error };
  }
  function safeEqual(a, b) {
    let diff = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }
  function text(value, max = MAX_TEXT) {
    return typeof value === "string" && value.length <= max ? value : null;
  }
  function validCollections(value) {
    if (!Array.isArray(value) || value.length > 200) return null;
    const rows2 = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null) return null;
      const { date, bin_name, stream } = item;
      if (typeof date !== "string" || !DATE.test(date)) return null;
      if (text(bin_name, 200) === null || typeof bin_name !== "string") return null;
      if (typeof stream !== "string" || !STREAMS.includes(stream)) return null;
      rows2.push({ date, bin_name, stream });
    }
    return rows2;
  }
  function handle(body, deps) {
    if (typeof body !== "object" || body === null) return fail("bad request");
    const request = body;
    if (deps.secret === void 0 || deps.secret === "") return fail("not configured");
    if (typeof request.secret !== "string" || !safeEqual(request.secret, deps.secret)) return fail("unauthorised");
    const withLock = deps.withLock ?? ((work) => work());
    const { tables } = deps;
    switch (request.action) {
      case "addresses": {
        const addresses = tables.addresses().map((address) => ({
          ...address,
          last_attempt: tables.getResult(address.uprn)?.last_attempt ?? null
        }));
        return { ok: true, addresses };
      }
      case "add_address": {
        const { uprn, ons_code, postcode, house_number } = request;
        if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
        if (typeof ons_code !== "string" || !ONS_CODE.test(ons_code)) return fail("bad ons_code");
        if (postcode !== void 0 && text(postcode, 10) === null) return fail("bad postcode");
        if (house_number !== void 0 && text(house_number, 100) === null) return fail("bad house_number");
        const row = { uprn, ons_code };
        if (typeof postcode === "string") row.postcode = postcode;
        if (typeof house_number === "string") row.house_number = house_number;
        withLock(() => {
          if (!tables.addresses().some((a) => a.uprn === uprn)) tables.addAddress(row);
        });
        return { ok: true };
      }
      case "save_success": {
        const { uprn, now } = request;
        const collections = validCollections(request.collections);
        if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
        if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
        if (collections === null) return fail("bad collections");
        withLock(
          () => tables.putResult({ uprn, fetched_at: now, last_attempt: now, last_error: null, consecutive_failures: 0, collections })
        );
        return { ok: true };
      }
      case "save_failure": {
        const { uprn, now } = request;
        const error = text(request.error);
        if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
        if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
        if (error === null) return fail("bad error");
        withLock(() => {
          const previous = tables.getResult(uprn);
          tables.putResult({
            uprn,
            fetched_at: previous?.fetched_at ?? null,
            last_attempt: now,
            last_error: error,
            consecutive_failures: (previous?.consecutive_failures ?? 0) + 1,
            collections: previous?.collections ?? []
          });
        });
        return { ok: true };
      }
      default:
        return fail("unknown action");
    }
  }

  // src/sheets.ts
  var ADDRESS_HEADERS = ["uprn", "ons_code", "postcode", "house_number", "created_at"];
  var RESULT_HEADERS = ["uprn", "fetched_at", "last_attempt", "last_error", "consecutive_failures", "collections_json"];
  function table(name, headers) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat("@");
    }
    return sheet;
  }
  function rows(sheet) {
    const last = sheet.getLastRow();
    return last < 2 ? [] : sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  }
  function findRow(sheet, uprn) {
    const last = sheet.getLastRow();
    if (last < 2) return null;
    const column = sheet.getRange(2, 1, last - 1, 1).getValues();
    const index = column.findIndex((row) => String(row[0]) === uprn);
    return index === -1 ? null : index + 2;
  }
  function optional(value) {
    return value === "" || value === void 0 || value === null ? void 0 : String(value);
  }
  var sheetTables = {
    addresses() {
      return rows(table("addresses", ADDRESS_HEADERS)).map((row) => {
        const address = { uprn: String(row[0]), ons_code: String(row[1]) };
        const postcode = optional(row[2]);
        const houseNumber = optional(row[3]);
        if (postcode) address.postcode = postcode;
        if (houseNumber) address.house_number = houseNumber;
        return address;
      });
    },
    addAddress(row) {
      const sheet = table("addresses", ADDRESS_HEADERS);
      sheet.appendRow([row.uprn, row.ons_code, row.postcode ?? "", row.house_number ?? "", (/* @__PURE__ */ new Date()).toISOString()]);
    },
    getResult(uprn) {
      const sheet = table("results", RESULT_HEADERS);
      const rowNumber = findRow(sheet, uprn);
      if (rowNumber === null) return null;
      const [, fetchedAt, lastAttempt, lastError, failures, json2] = sheet.getRange(rowNumber, 1, 1, RESULT_HEADERS.length).getValues()[0];
      return {
        uprn,
        fetched_at: optional(fetchedAt) ?? null,
        last_attempt: String(lastAttempt),
        last_error: optional(lastError) ?? null,
        consecutive_failures: Number(failures) || 0,
        collections: json2 ? JSON.parse(String(json2)) : []
      };
    },
    putResult(row) {
      const sheet = table("results", RESULT_HEADERS);
      const values = [
        row.uprn,
        row.fetched_at ?? "",
        row.last_attempt,
        row.last_error ?? "",
        row.consecutive_failures,
        JSON.stringify(row.collections)
      ];
      const rowNumber = findRow(sheet, row.uprn) ?? sheet.getLastRow() + 1;
      sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    }
  };

  // src/main.ts
  function json(body) {
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }
  function doGet(e) {
    if (e?.parameter?.feed === "poc") {
      const now = /* @__PURE__ */ new Date();
      const today = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
      const calendar = buildCalendar("Bin Day PoC", pocEvents(today), now);
      return ContentService.createTextOutput(calendar).setMimeType(ContentService.MimeType.ICAL);
    }
    return json({ ok: true, service: "bin-day-poc", time: (/* @__PURE__ */ new Date()).toISOString() });
  }
  function withScriptLock(work) {
    const lock = LockService.getScriptLock();
    lock.waitLock(2e4);
    try {
      return work();
    } finally {
      lock.releaseLock();
    }
  }
  function doPost(e) {
    let body;
    try {
      body = JSON.parse(e?.postData?.contents ?? "null");
    } catch {
      return json({ ok: false, error: "body is not JSON" });
    }
    if (typeof body === "object" && body !== null && "action" in body) {
      const secret = PropertiesService.getScriptProperties().getProperty("FETCHER_SECRET") ?? void 0;
      return json(handle(body, { secret, tables: sheetTables, withLock: withScriptLock }));
    }
    return json({ ok: true, received: body });
  }
  Object.assign(globalThis, { doGet, doPost });
})();
