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
  function escapeText(text) {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
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
  function doPost(e) {
    try {
      return json({ ok: true, received: JSON.parse(e?.postData?.contents ?? "null") });
    } catch {
      return json({ ok: false, error: "body is not JSON" });
    }
  }
  Object.assign(globalThis, { doGet, doPost });
})();
