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
    var _a;
    const code = (_a = char.codePointAt(0)) != null ? _a : 0;
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

  // src/dates.ts
  function utc(date) {
    return /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  }
  function weekdayIndex(date) {
    return (utc(date).getUTCDay() + 6) % 7;
  }
  function mondayOf(date) {
    return addDays(date, -weekdayIndex(date));
  }
  function daysBetween(from, to) {
    return Math.round((utc(to).getTime() - utc(from).getTime()) / 864e5);
  }
  function isoWeek(date) {
    const monday = mondayOf(date);
    const year = Number(addDays(monday, 3).slice(0, 4));
    const week = 1 + daysBetween(mondayOf(`${year}-01-04`), monday) / 7;
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  // src/projection.ts
  var HORIZON_DAYS = 56;
  var CHRISTMAS_START = "12-22";
  var CHRISTMAS_END = "01-13";
  function overlapsChristmas(weekStart, weekEnd) {
    const year = Number(weekStart.slice(0, 4));
    for (const y of [year - 1, year]) {
      const start = `${y}-${CHRISTMAS_START}`;
      const end = `${y + 1}-${CHRISTMAS_END}`;
      if (weekStart <= end && weekEnd >= start) return true;
    }
    return false;
  }
  function inHolidayWeek(date, holidays) {
    const start = mondayOf(date);
    const end = addDays(start, 6);
    return holidays.some((holiday) => holiday >= start && holiday <= end) || overlapsChristmas(start, end);
  }
  function projectCollections(input) {
    var _a, _b, _c;
    const { collections, council, today, holidays } = input;
    const binTypes = (_a = council.bin_types) != null ? _a : {};
    const horizon = addDays(today, HORIZON_DAYS);
    const result = [];
    const byBin = /* @__PURE__ */ new Map();
    for (const collection of collections) {
      if (!binTypes[collection.bin_name]) continue;
      byBin.set(collection.bin_name, [...(_b = byBin.get(collection.bin_name)) != null ? _b : [], collection.date]);
    }
    for (const [binName, dates] of byBin) {
      const binType = binTypes[binName];
      const label = (_c = binType.label) != null ? _c : binName;
      const confirmed = new Set(dates.filter((date) => date >= today));
      for (const date of confirmed) {
        result.push({ date, bin_name: binName, stream: binType.stream, label, confirmed: true });
      }
      const weeks = binType.every_weeks;
      if (council.schedule !== "next_only" || weeks === void 0 || holidays === void 0) continue;
      const anchor = [...dates].sort().at(-1);
      for (let date = addDays(anchor, weeks * 7); date <= horizon; date = addDays(date, weeks * 7)) {
        if (date < today || confirmed.has(date) || inHolidayWeek(date, holidays)) continue;
        result.push({ date, bin_name: binName, stream: binType.stream, label, confirmed: false });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.bin_name.localeCompare(b.bin_name));
  }

  // ../registry/bank-holidays.json
  var bank_holidays_default = {
    note: "Weekday bank holidays, including substitute days, per region. Used to avoid projecting dates into a holiday week (the calendar feed) and to tell expected holiday shifts from round changes (change detection). Only regions marked verified are used by the code. To verify a region, check every date against the official page named in its source, then set verified to true. The dates run to the end of 2027: add the next years before then (a test reminds us).",
    regions: {
      "england-and-wales": {
        verified: true,
        source: "GOV.UK UK bank holidays, and the Privy Council proclamation for 2027 (https://www.gov.uk/bank-holidays)",
        dates: [
          "2026-01-01",
          "2026-04-03",
          "2026-04-06",
          "2026-05-04",
          "2026-05-25",
          "2026-08-31",
          "2026-12-25",
          "2026-12-28",
          "2027-01-01",
          "2027-03-26",
          "2027-03-29",
          "2027-05-03",
          "2027-05-31",
          "2027-08-30",
          "2027-12-27",
          "2027-12-28"
        ]
      },
      scotland: {
        verified: false,
        source: "Draft, to check against https://www.gov.scot/publications/bank-holidays/. 4 January 2027 (in place of Saturday 2 January) and 31 May 2027 are confirmed by the Privy Council proclamation; the rest are the usual pattern (first Monday in August, 30 November St Andrew's Day) and are unconfirmed. A one-off 15 June 2026 holiday was mentioned by one source and is not included.",
        dates: [
          "2026-01-01",
          "2026-01-02",
          "2026-04-03",
          "2026-05-04",
          "2026-05-25",
          "2026-08-03",
          "2026-11-30",
          "2026-12-25",
          "2026-12-28",
          "2027-01-01",
          "2027-01-04",
          "2027-03-26",
          "2027-05-03",
          "2027-05-31",
          "2027-08-02",
          "2027-11-30",
          "2027-12-27",
          "2027-12-28"
        ]
      },
      "northern-ireland": {
        verified: false,
        source: "Draft, to check against https://www.nidirect.gov.uk/articles/bank-holidays. 12 July 2027 is confirmed by the Privy Council proclamation and several 2026 dates by a Northern Ireland health circular; the other 2027 dates are the usual pattern and are unconfirmed.",
        dates: [
          "2026-01-01",
          "2026-03-17",
          "2026-04-03",
          "2026-04-06",
          "2026-05-04",
          "2026-05-25",
          "2026-07-13",
          "2026-08-31",
          "2026-12-25",
          "2026-12-28",
          "2027-01-01",
          "2027-03-17",
          "2027-03-26",
          "2027-03-29",
          "2027-05-03",
          "2027-05-31",
          "2027-07-12",
          "2027-08-30",
          "2027-12-27",
          "2027-12-28"
        ]
      }
    }
  };

  // ../registry/councils.json
  var councils_default = {
    councils: [
      {
        ons_code: "E06000003",
        name: "Redcar and Cleveland",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "RedcarandClevelandCouncil",
          url: "https://www.redcar-cleveland.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          FOOD: {
            stream: "food",
            label: "FOOD"
          },
          RECYCLING: {
            stream: "recycling",
            label: "RECYCLING"
          },
          REFUSE: {
            stream: "general",
            label: "REFUSE"
          }
        },
        test_address: {
          postcode: "TS10 2RE",
          house_number: "11"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 5 dates over 28 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E06000011",
        name: "East Riding of Yorkshire",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "EastRidingCouncil",
          url: "https://www.eastriding.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Blue Bin (Recycling)": {
            stream: "recycling",
            label: "Blue Bin (Recycling)"
          },
          "Brown Bin (Garden Waste)": {
            stream: "garden",
            label: "Brown Bin (Garden Waste)"
          },
          "Green Bin (General Waste)": {
            stream: "general",
            label: "Green Bin (General Waste)"
          }
        },
        test_address: {
          postcode: "HU17 8LG",
          house_number: "14"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E06000022",
        name: "Bath and North East Somerset",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "BathAndNorthEastSomersetCouncil",
          url: "https://www.bathnes.gov.uk/webforms/waste/collectionday/",
          skip_get_url: true
        },
        inputs: [
          "uprn"
        ],
        needs_selenium: false,
        bin_types: {
          "Black Rubbish Bin (140L)": {
            stream: "general",
            label: "Black bin",
            colour: "black",
            every_weeks: 2
          },
          "Blue Recycling Bag for Cardboard": {
            stream: "recycling",
            label: "Blue bag (cardboard)",
            colour: "blue",
            every_weeks: 1
          },
          "Green Recycling Box": {
            stream: "recycling",
            label: "Green box",
            colour: "green",
            every_weeks: 1
          },
          "Food Recycling Collection Bin": {
            stream: "food",
            label: "Food caddy",
            every_weeks: 1
          }
        },
        test_address: {
          uprn: "100120000855"
        },
        last_verified: "2026-10-26",
        notes: "Plain HTTP, needs only a UPRN. The API returns only the next collection date for each bin, so every_weeks says how often each bin is emptied. Frequencies are from the council's own pages and published calendar (checked 2026-10-26). The Monday A calendar for November 2025 to November 2026 (app.bathnes.gov.uk/WebForms/waste/attachments/) shows food bin, green box and blue bag collected every Monday, and the rubbish bin on alternate Mondays, so the same bins are emptied every 1 and 2 weeks. The council's pages say the same: rubbish every other week (https://www.bathnes.gov.uk/rubbish), food waste weekly (https://www.bathnes.gov.uk/food-waste), green recycling box weekly (https://www.bathnes.gov.uk/green-recycling-box), blue recycling bag weekly (https://www.bathnes.gov.uk/blue-recycling-bag). Garden waste is fortnightly on the same calendar, with a winter gap, but its bin name has not been seen yet, so it is not mapped. The frequencies were also confirmed by the project owner on 2026-10-26. Calendars exist per round (for example Monday A, Friday B). Only Monday A has been read so far; the other rounds are assumed to follow the same frequencies and should be checked against one more calendar."
      },
      {
        ons_code: "E06000036",
        name: "Bracknell Forest",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "BracknellForestCouncil",
          url: "https://selfservice.mybfc.bracknell-forest.gov.uk/w/webpage/waste-collection-days",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          Food: {
            stream: "food",
            label: "Food"
          },
          "General waste": {
            stream: "general",
            label: "General waste"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          }
        },
        test_address: {
          postcode: "GU47 9BS",
          house_number: "57"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 3 dates over 42 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E06000039",
        name: "Slough",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "SloughBoroughCouncil",
          url: "https://waste.slough.gov.uk/PublicDashboard",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          Garden: {
            stream: "garden",
            label: "Garden"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          },
          Waste: {
            stream: "general",
            label: "Waste"
          }
        },
        test_address: {
          postcode: "SL2 2EW",
          house_number: "149"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 7 dates over 84 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E06000041",
        name: "Wokingham",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "WokinghamBoroughCouncil",
          url: "https://www.wokingham.gov.uk/rubbish-and-recycling/waste-collection/find-your-bin-collection-day",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Garden waste": {
            stream: "garden",
            label: "Garden waste"
          },
          "Household waste": {
            stream: "general",
            label: "Household waste"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          }
        },
        test_address: {
          postcode: "RG40 2HR",
          house_number: "90"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E06000043",
        name: "Brighton and Hove",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "BrightonandHoveCityCouncil",
          url: "https://enviroservices.brighton-hove.gov.uk/link/collections",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food waste": {
            stream: "food",
            label: "Food waste"
          },
          "Garden Waste": {
            stream: "garden",
            label: "Garden Waste"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          },
          Refuse: {
            stream: "general",
            label: "Refuse"
          }
        },
        test_address: {
          postcode: "BN1 8NE",
          house_number: "44"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E06000066",
        name: "Somerset",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "SomersetCouncil",
          url: "https://www.somerset.gov.uk/",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food Recycling": {
            stream: "food",
            label: "Food Recycling"
          },
          "Recycling Collection": {
            stream: "recycling",
            label: "Recycling Collection"
          },
          "Rubbish Collection": {
            stream: "general",
            label: "Rubbish Collection"
          }
        },
        test_address: {
          postcode: "TA6 4AA",
          house_number: "5"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000037",
        name: "High Peak",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "HighPeakCouncil",
          url: "https://bins.highpeak.gov.uk/PublicDashboard",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          Food: {
            stream: "food",
            label: "Food"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          },
          Rubbish: {
            stream: "general",
            label: "Rubbish"
          }
        },
        test_address: {
          postcode: "SK13 8BX",
          house_number: "9 Ellison Street, Glossop"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 14 dates over 91 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: same house. No colours are set."
      },
      {
        ons_code: "E07000071",
        name: "Colchester",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "ColchesterCityCouncil",
          url: "https://www.colchester.gov.uk/your-recycling-calendar"
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food waste": {
            stream: "food",
            label: "Food waste"
          },
          Glass: {
            stream: "recycling",
            label: "Glass"
          },
          "Mixed recycling (paper/card/plastics/tins/cans)": {
            stream: "recycling",
            label: "Mixed recycling (paper/card/plastics/tins/cans)"
          },
          "Non-recyclable rubbish": {
            stream: "general",
            label: "Non-recyclable rubbish"
          }
        },
        test_address: {
          postcode: "CO2 8UN",
          house_number: "29"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned a full schedule of 4 dates over 21 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000075",
        name: "Rochford",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "RochfordCouncil",
          url: "https://www.rochford.gov.uk/bins-and-collections",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Garden Waste (Green Bin)": {
            stream: "garden",
            label: "Garden Waste (Green Bin)"
          },
          "Non-recyclables (Purple Lid)": {
            stream: "general",
            label: "Non-recyclables (Purple Lid)"
          },
          "Recyclables (Black Bin)": {
            stream: "recycling",
            label: "Recyclables (Black Bin)"
          }
        },
        test_address: {
          postcode: "SS4 1AS",
          house_number: "88"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 11 dates over 112 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000080",
        name: "Forest of Dean",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "ForestOfDeanDistrictCouncil",
          url: "https://community.fdean.gov.uk/s/waste-collection-enquiry",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "240 Litre Refuse": {
            stream: "general",
            label: "240 Litre Refuse"
          },
          "Blue Bag": {
            stream: "recycling",
            label: "Blue Bag"
          },
          "Garden Bin": {
            stream: "garden",
            label: "Garden Bin"
          },
          "Green Recycling Box": {
            stream: "recycling",
            label: "Green Recycling Box"
          },
          "Outdoor Food Caddy": {
            stream: "food",
            label: "Outdoor Food Caddy"
          }
        },
        test_address: {
          postcode: "GL15 6JT",
          house_number: "ELMOGAL, PARKEND ROAD, BREAM, LYDNEY"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000094",
        name: "Winchester",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "WinchesterCityCouncil",
          url: "https://iportal.itouchvision.com/icollectionday/collection-day"
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "FOOD WASTE: your next weekly collection is on": {
            stream: "food",
            label: "FOOD WASTE: your next weekly collection is on"
          },
          "Garden Waste Collection": {
            stream: "garden",
            label: "Garden Waste Collection"
          },
          "General Waste Collection": {
            stream: "general",
            label: "General Waste Collection"
          },
          "Glass Collection": {
            stream: "recycling",
            label: "Glass Collection"
          },
          "Recycling Collection": {
            stream: "recycling",
            label: "Recycling Collection"
          }
        },
        test_address: {
          postcode: "SO23 7GA",
          house_number: "12"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000099",
        name: "North Hertfordshire",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "NorthHertfordshireDistrictCouncil",
          url: "https://waste.nc.north-herts.gov.uk/w/webpage/find-bin-collection-day-input-address",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Cardboard & Paper": {
            stream: "recycling",
            label: "Cardboard & Paper"
          },
          "Food Waste": {
            stream: "food",
            label: "Food Waste"
          },
          "Mixed Recycling": {
            stream: "recycling",
            label: "Mixed Recycling"
          },
          "Non-Recyclable Waste": {
            stream: "general",
            label: "Non-Recyclable Waste"
          }
        },
        test_address: {
          postcode: "SG5 1PZ",
          house_number: "Stewards Flat"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000109",
        name: "Gravesham",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "GraveshamBoroughCouncil",
          url: "https://my.gravesham.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "FOOD BIN": {
            stream: "food",
            label: "FOOD BIN"
          },
          "GARDEN 240L": {
            stream: "garden",
            label: "GARDEN 240L"
          },
          "RECYCLING 240L": {
            stream: "recycling",
            label: "RECYCLING 240L"
          },
          "REFUSE 180L": {
            stream: "general",
            label: "REFUSE 180L"
          }
        },
        test_address: {
          postcode: "DA13 9DF",
          house_number: "2"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 8 dates over 21 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000110",
        name: "Maidstone",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "MaidstoneBoroughCouncil",
          url: "https://my.maidstone.gov.uk/service/Find-your-bin-day",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food waste on Tuesdays": {
            stream: "food",
            label: "Food waste on Tuesdays"
          },
          "Garden Waste on Tuesdays": {
            stream: "garden",
            label: "Garden Waste on Tuesdays"
          },
          "General waste on Tuesdays": {
            stream: "general",
            label: "General waste on Tuesdays"
          },
          "Recycling on Tuesdays": {
            stream: "recycling",
            label: "Recycling on Tuesdays"
          }
        },
        test_address: {
          postcode: "ME16 8BT",
          house_number: "71"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000111",
        name: "Sevenoaks",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "SevenoaksDistrictCouncil",
          url: "https://sevenoaks-dc-host01.oncreate.app/w/webpage/waste-collection-day",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          Food: {
            stream: "food",
            label: "Food"
          },
          "General waste": {
            stream: "general",
            label: "General waste"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          }
        },
        test_address: {
          postcode: "TN15 6EB",
          house_number: "60 Hever Road"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: same house. No colours are set."
      },
      {
        ons_code: "E07000144",
        name: "Broadland",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "BroadlandDistrictCouncil",
          url: "https://area.southnorfolkandbroadland.gov.uk/FindAddress",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          Food: {
            stream: "food",
            label: "Food"
          },
          Garden: {
            stream: "garden",
            label: "Garden"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          },
          Rubbish: {
            stream: "general",
            label: "Rubbish"
          }
        },
        test_address: {
          postcode: "NR10 3FD",
          house_number: "1"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000147",
        name: "North Norfolk",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "NorthNorfolkDistrictCouncil",
          url: "https://www.north-norfolk.gov.uk/",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Brown bin": {
            stream: "garden",
            label: "Brown bin"
          },
          "Green bin": {
            stream: "recycling",
            label: "Green bin"
          },
          "Grey bin": {
            stream: "general",
            label: "Grey bin"
          }
        },
        test_address: {
          postcode: "NR25 6BH",
          house_number: "1 Morston Mews"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword, except 'Green bin', which were read from the council's website (see docs/spike-results/bin-colour-evidence.json), and are not checked by a person. A bare house number: same house. No colours are set."
      },
      {
        ons_code: "E07000171",
        name: "Bassetlaw",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "BassetlawDistrictCouncil",
          url: "https://www.bassetlaw.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "first_line",
        needs_selenium: false,
        bin_types: {
          "Black Glass Recycling Bin": {
            stream: "recycling",
            label: "Black Glass Recycling Bin"
          },
          "Blue Recycling Bin": {
            stream: "recycling",
            label: "Blue Recycling Bin"
          },
          "Green Household Waste Bin": {
            stream: "general",
            label: "Green Household Waste Bin"
          }
        },
        test_address: {
          postcode: "DN22 6JD",
          house_number: "2 Albert Road"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 4 dates over 42 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: error ValueError. No colours are set."
      },
      {
        ons_code: "E07000181",
        name: "West Oxfordshire",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "WestOxfordshireDistrictCouncil",
          url: "https://community.westoxon.gov.uk/s/waste-collection-enquiry",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "1100 Litre Recycling": {
            stream: "recycling",
            label: "1100 Litre Recycling"
          },
          "1100 Litre Refuse": {
            stream: "general",
            label: "1100 Litre Refuse"
          },
          "140 Litre Food": {
            stream: "food",
            label: "140 Litre Food"
          },
          "240 Litre Glass": {
            stream: "recycling",
            label: "240 Litre Glass"
          }
        },
        test_address: {
          postcode: "OX28 1YA",
          house_number: "24"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000200",
        name: "Babergh",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "BaberghDistrictCouncil",
          url: "https://www.babergh.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food Waste Collection": {
            stream: "food",
            label: "Food Waste Collection"
          },
          "Garden Waste Collection (Brown Bin)": {
            stream: "garden",
            label: "Garden Waste Collection (Brown Bin)"
          },
          "Paper And Card Collection": {
            stream: "recycling",
            label: "Paper And Card Collection"
          },
          "Recycling Collection": {
            stream: "recycling",
            label: "Recycling Collection"
          },
          "Refuse Collection (General Rubbish)": {
            stream: "general",
            label: "Refuse Collection (General Rubbish)"
          }
        },
        test_address: {
          postcode: "CO6 4RA",
          house_number: "Little Changes"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned a full schedule of 4 dates over 21 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000203",
        name: "Mid Suffolk",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "MidSuffolkDistrictCouncil",
          url: "https://www.midsuffolk.gov.uk/check-your-collection-day",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food Waste Collection": {
            stream: "food",
            label: "Food Waste Collection"
          },
          "Garden Waste Collection (Brown Bin)": {
            stream: "garden",
            label: "Garden Waste Collection (Brown Bin)"
          },
          "Paper And Card Collection": {
            stream: "recycling",
            label: "Paper And Card Collection"
          },
          "Recycling Collection": {
            stream: "recycling",
            label: "Recycling Collection"
          },
          "Refuse Collection (General Rubbish)": {
            stream: "general",
            label: "Refuse Collection (General Rubbish)"
          }
        },
        test_address: {
          postcode: "IP23 8EF",
          house_number: "91"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned a full schedule of 4 dates over 21 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000209",
        name: "Guildford",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "GuildfordCouncil",
          url: "https://my.guildford.gov.uk/customers/s/view-bin-collections",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food Containers": {
            stream: "food",
            label: "Food Containers"
          },
          "Recycling Containers": {
            stream: "recycling",
            label: "Recycling Containers"
          },
          "Refuse Containers": {
            stream: "general",
            label: "Refuse Containers"
          }
        },
        test_address: {
          postcode: "GU3 1AH",
          house_number: "THE LODGE"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000213",
        name: "Spelthorne",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "SpelthorneBoroughCouncil",
          url: "https://www.spelthorne.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Food Waste Bin": {
            stream: "food",
            label: "Food Waste Bin"
          },
          "Garden Waste": {
            stream: "garden",
            label: "Garden Waste"
          },
          "Recycling Bin": {
            stream: "recycling",
            label: "Recycling Bin"
          },
          "Rubbish Bin": {
            stream: "general",
            label: "Rubbish Bin"
          }
        },
        test_address: {
          postcode: "TW18 2PR",
          house_number: "1"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000214",
        name: "Surrey Heath",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "SurreyHeathBoroughCouncil",
          url: "https://asjwsw-wrpsurreyheathmunicipal-live.whitespacews.com/",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Food waste": {
            stream: "food",
            label: "Food waste"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          },
          Rubbish: {
            stream: "general",
            label: "Rubbish"
          }
        },
        test_address: {
          postcode: "GU20 6PN",
          house_number: "36"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 5 dates over 28 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E07000224",
        name: "Arun",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "ArunCouncil",
          url: "https://www1.arun.gov.uk/when-are-my-bins-collected",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          Food: {
            stream: "food",
            label: "Food"
          },
          Garden: {
            stream: "garden",
            label: "Garden"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          },
          Rubbish: {
            stream: "general",
            label: "Rubbish"
          }
        },
        test_address: {
          postcode: "BN16 4DA",
          house_number: "1"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E08000002",
        name: "Bury",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "BuryCouncil",
          url: "https://www.bury.gov.uk/waste-and-recycling/bin-collection-days-and-alerts",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          blue: {
            stream: "recycling",
            label: "blue"
          },
          brown: {
            stream: "garden",
            label: "brown"
          },
          green: {
            stream: "recycling",
            label: "green"
          },
          grey: {
            stream: "general",
            label: "grey"
          }
        },
        test_address: {
          postcode: "M26 3XY",
          house_number: "3"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword, except 'green', which were read from the council's website (see docs/spike-results/bin-colour-evidence.json), and are not checked by a person. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E08000013",
        name: "St. Helens",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "StHelensBC",
          url: "https://www.sthelens.gov.uk/",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "General non-recyclable waste": {
            stream: "general",
            label: "General non-recyclable waste"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          }
        },
        test_address: {
          postcode: "L34 2GA",
          house_number: "15"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned a full schedule of 17 dates over 112 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E08000015",
        name: "Wirral",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "WirralCouncil",
          url: "https://www.wirral.gov.uk"
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Green non-recyclable": {
            stream: "general",
            label: "Green non-recyclable"
          },
          "Grey food waste": {
            stream: "food",
            label: "Grey food waste"
          },
          "Grey recycling": {
            stream: "recycling",
            label: "Grey recycling"
          },
          "Small grey": {
            stream: "general",
            label: "Small grey"
          }
        },
        test_address: {
          postcode: "CH43 1SX",
          house_number: "1"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 27 dates over 182 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E08000017",
        name: "Doncaster",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "DoncasterCouncil",
          url: "https://doncaster-wasterecycling.oncreate.app/w/webpage/bin-query",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          },
          Refuse: {
            stream: "general",
            label: "Refuse"
          }
        },
        test_address: {
          postcode: "DN6 9EU",
          house_number: "The Laurels Nursing Home"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned a full schedule of 8 dates over 98 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E08000021",
        name: "Newcastle upon Tyne",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "NewcastleCityCouncil",
          url: "https://new.newcastle.gov.uk/recycling-waste/check-your-bin-collection-day",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "first_line",
        needs_selenium: false,
        bin_types: {
          "General Waste": {
            stream: "general",
            label: "General waste"
          },
          Recycling: {
            stream: "recycling",
            label: "Recycling"
          }
        },
        test_address: {
          postcode: "NE3 4XE",
          house_number: "1 Northumberland Avenue"
        },
        last_verified: "2026-10-28",
        notes: `Plain HTTP, no browser (it uses the ReCollect API, and upstream passes -s to skip fetching the page). Takes a postcode and a house number (no UPRN). On 2026-10-28 the module returned 8 entries: General Waste and Recycling, each every 14 days for about seven weeks, so this is a full schedule and no every_weeks is set. Passed upstream's integration suite (FRE-263). Only two bin names have been seen. Newcastle also runs a paid garden waste service, but this module did not return a garden bin for the test address, so garden waste is not mapped yet and the garden question has no effect here. Bin colours and the council's own naming have not been checked against its website, so only neutral labels are set. On 2026-10-28 a bare house number ("1") found no address for the test postcode, while the first line of the address (house number and street) worked, so house_input is first_line. The module ignores the postcode when it is given a text address, and when a postcode search finds addresses but none starts with the text it falls back to the first one listed, so a typo can return another house's dates. See docs/coverage.md.`
      },
      {
        ons_code: "E09000003",
        name: "Barnet",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "BarnetCouncil",
          url: "https://www.barnet.gov.uk/recycling-and-waste/bin-collections/find-your-bin-collection-day",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food Waste": {
            stream: "food",
            label: "Food Waste"
          },
          "General Waste": {
            stream: "general",
            label: "General Waste"
          },
          "Recycling Bin": {
            stream: "recycling",
            label: "Recycling Bin"
          }
        },
        test_address: {
          postcode: "EN4 8TB",
          house_number: "26A"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E09000005",
        name: "Brent",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "BrentCouncil",
          url: "https://recyclingservices.brent.gov.uk/waste",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Food waste collection": {
            stream: "food",
            label: "Food waste collection"
          },
          "Garden waste collection": {
            stream: "garden",
            label: "Garden waste collection"
          },
          "Paper and cardboard (blue sacks) collection": {
            stream: "recycling",
            label: "Paper and cardboard (blue sacks) collection"
          },
          "Recycling collection": {
            stream: "recycling",
            label: "Recycling collection"
          },
          "Rubbish collection": {
            stream: "general",
            label: "Rubbish collection"
          }
        },
        test_address: {
          postcode: "HA3 0QU",
          house_number: "25"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 9 dates over 56 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E09000008",
        name: "Croydon",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "CroydonCouncil",
          url: "https://service.croydon.gov.uk/wasteservices/w/webpage/bin-day-enter-address",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Food waste": {
            stream: "food",
            label: "Food waste"
          },
          "General rubbish": {
            stream: "general",
            label: "General rubbish"
          },
          "Glass, plastics, cans and cartons recycling": {
            stream: "recycling",
            label: "Glass, plastics, cans and cartons recycling"
          },
          "Paper and card recycling": {
            stream: "recycling",
            label: "Paper and card recycling"
          }
        },
        test_address: {
          postcode: "SE25 5DW",
          house_number: "13"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E09000010",
        name: "Enfield",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "EnfieldCouncil",
          url: "https://www.enfield.gov.uk/services/rubbish-and-recycling/find-my-collection-day",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "black bin": {
            stream: "general",
            label: "black bin"
          },
          "blue bin": {
            stream: "recycling",
            label: "blue bin"
          },
          "brown bin": {
            stream: "garden",
            label: "brown bin"
          }
        },
        test_address: {
          postcode: "N13 5AJ",
          house_number: "111"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "E09000012",
        name: "Hackney",
        status: "supported",
        schedule: "full",
        source: {
          type: "ukbcd",
          module: "HackneyCouncil",
          url: "https://www.hackney.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Food Caddy (Small)": {
            stream: "food",
            label: "Food Caddy (Small)"
          },
          "Recycling Sack": {
            stream: "recycling",
            label: "Recycling Sack"
          },
          "Wheeled Bin (180ltr)": {
            stream: "general",
            label: "Wheeled Bin (180ltr)"
          }
        },
        test_address: {
          postcode: "N16 9AS",
          house_number: "101"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned a full schedule of 108 dates over 770 days. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "N09000006",
        name: "Fermanagh and Omagh",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "FermanaghOmaghDistrictCouncil",
          url: "https://www.fermanaghomagh.com/services/environment-and-waste/waste-collection-calendar/",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          "Black Landfill": {
            stream: "general",
            label: "Black Landfill"
          },
          "Blue Recycling": {
            stream: "recycling",
            label: "Blue Recycling"
          },
          "Brown Composting": {
            stream: "garden",
            label: "Brown Composting"
          }
        },
        test_address: {
          postcode: "BT74 6DQ",
          house_number: "20"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "N09000007",
        name: "Lisburn and Castlereagh",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "LisburnCastlereaghCityCouncil",
          url: "https://lisburn.isl-fusion.com",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: false,
        bin_types: {
          BrownBin: {
            stream: "garden",
            label: "BrownBin"
          },
          RecycleBin: {
            stream: "recycling",
            label: "RecycleBin"
          },
          ResidualBin: {
            stream: "general",
            label: "ResidualBin"
          }
        },
        test_address: {
          postcode: "BT28 1JN",
          house_number: "97"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: plain HTTP (no browser in the module), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "W06000008",
        name: "Ceredigion",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "CeredigionCountyCouncil",
          url: "https://www.ceredigion.gov.uk/resident/bins-recycling/"
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Clear Recycling Bag": {
            stream: "recycling",
            label: "Clear Recycling Bag"
          },
          "Food Waste": {
            stream: "food",
            label: "Food Waste"
          },
          "Glass Bottles and Jars": {
            stream: "recycling",
            label: "Glass Bottles and Jars"
          },
          "Non-Recyclable Waste": {
            stream: "general",
            label: "Non-Recyclable Waste"
          }
        },
        test_address: {
          postcode: "SY23 4RQ",
          house_number: "BLAEN CWMMAGWR, TRISANT, CEREDIGION, SY23 4RQ"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      },
      {
        ons_code: "W06000012",
        name: "Neath Port Talbot",
        status: "supported",
        schedule: "next_only",
        source: {
          type: "ukbcd",
          module: "NeathPortTalbotCouncil",
          url: "https://www.npt.gov.uk",
          skip_get_url: true
        },
        inputs: [
          "postcode",
          "house_number"
        ],
        house_input: "number_or_name",
        needs_selenium: true,
        bin_types: {
          "Cardboard, Cartons and Paper (White Bag)": {
            stream: "recycling",
            label: "Cardboard, Cartons and Paper (White Bag)"
          },
          "Food Waste (Green Bin)": {
            stream: "food",
            label: "Food Waste (Green Bin)"
          },
          "Garden Waste (Green bag)": {
            stream: "garden",
            label: "Garden Waste (Green bag)"
          },
          "General Household Rubbish (Wheelie bin / black bags)": {
            stream: "general",
            label: "General Household Rubbish (Wheelie bin / black bags)"
          },
          "Glass (Black box without lid)": {
            stream: "recycling",
            label: "Glass (Black box without lid)"
          },
          "Plastic / Tins / Cans (White Bag)": {
            stream: "recycling",
            label: "Plastic / Tins / Cans (White Bag)"
          }
        },
        test_address: {
          postcode: "SA13 3BA",
          house_number: "2"
        },
        last_verified: "2026-10-28",
        notes: "Generated from upstream's test inputs and a probe on 2026-10-28: drives a browser (Selenium), returned only the next date per bin, so how often each bin is emptied is learned from repeat fetches (fetcher/learned.py) and the feed shows only confirmed dates until then. Bin streams were mapped from the council's own bin names by keyword and are not checked against the council's website. A bare house number: not applicable. No colours are set."
      }
    ]
  };

  // src/registry.ts
  var BUNDLED_COUNCILS = councils_default.councils;
  var councils = BUNDLED_COUNCILS;
  var learned = {};
  function getCouncil(onsCode) {
    const council = councils.find((c) => c.ons_code === onsCode);
    const weeks = learned[onsCode];
    if (!council || !weeks || council.schedule !== "next_only" || !council.bin_types) return council;
    const bin_types = {};
    for (const [name, bin] of Object.entries(council.bin_types)) {
      bin_types[name] = bin.every_weeks === void 0 && weeks[name] !== void 0 ? { ...bin, every_weeks: weeks[name] } : bin;
    }
    return { ...council, bin_types };
  }
  function setLearnedFrequencies(data) {
    learned = data;
  }
  function parseLearnedFrequencies(raw) {
    var _a;
    const bins = raw == null ? void 0 : raw.bins;
    if (typeof bins !== "object" || bins === null || Array.isArray(bins)) return null;
    const result = {};
    for (const [code, perBin] of Object.entries(bins)) {
      if (!ONS_CODE.test(code) || typeof perBin !== "object" || perBin === null) continue;
      for (const [name, entry] of Object.entries(perBin)) {
        const weeks = entry == null ? void 0 : entry.weeks;
        if (name.length > 200 || typeof weeks !== "number" || !Number.isInteger(weeks) || weeks < 1 || weeks > 4) continue;
        result[code] = (_a = result[code]) != null ? _a : {};
        result[code][name] = weeks;
      }
    }
    return result;
  }
  function setCouncils(list) {
    councils = list;
  }
  var ONS_CODE = /^[ENSW][0-9]{8}$/;
  var STREAMS = ["general", "recycling", "food", "garden"];
  var STATUSES = ["supported", "unsupported", "broken"];
  var INPUTS = ["uprn", "postcode", "house_number"];
  var MAX_COUNCILS = 2e3;
  function slimBinTypes(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const slim = {};
    for (const [name, raw] of Object.entries(value)) {
      const bin = raw;
      if (name.length > 200 || typeof bin !== "object" || bin === null || !STREAMS.includes(bin.stream)) return null;
      const entry = { stream: bin.stream };
      if (typeof bin.label === "string" && bin.label.length <= 200) entry.label = bin.label;
      if (typeof bin.every_weeks === "number" && Number.isInteger(bin.every_weeks) && bin.every_weeks >= 1 && bin.every_weeks <= 4) entry.every_weeks = bin.every_weeks;
      slim[name] = entry;
    }
    return slim;
  }
  function slimCouncils(raw) {
    const list = raw == null ? void 0 : raw.councils;
    if (!Array.isArray(list) || list.length > MAX_COUNCILS) return null;
    const slim = [];
    for (const item of list) {
      const c = item;
      if (typeof c !== "object" || c === null) continue;
      if (typeof c.ons_code !== "string" || !ONS_CODE.test(c.ons_code)) continue;
      if (typeof c.name !== "string" || c.name === "" || c.name.length > 200) continue;
      if (!STATUSES.includes(c.status)) continue;
      const council = { ons_code: c.ons_code, name: c.name, status: c.status };
      if (c.schedule === "next_only" || c.schedule === "full") council.schedule = c.schedule;
      if (Array.isArray(c.inputs) && c.inputs.every((i) => INPUTS.includes(i))) council.inputs = c.inputs;
      if (c.house_input === "number_or_name" || c.house_input === "first_line") council.house_input = c.house_input;
      if (c.bin_types !== void 0) {
        const bins = slimBinTypes(c.bin_types);
        if (bins === null) continue;
        council.bin_types = bins;
      }
      slim.push(council);
    }
    return slim.length > 0 ? slim : null;
  }
  function regionFor(onsCode) {
    return onsCode.startsWith("E") || onsCode.startsWith("W") ? "england-and-wales" : onsCode.startsWith("S") ? "scotland" : "northern-ireland";
  }
  var BUNDLED_BANK_HOLIDAYS = bank_holidays_default;
  var bankHolidays = BUNDLED_BANK_HOLIDAYS;
  function setBankHolidays(data) {
    bankHolidays = data;
  }
  function parseBankHolidays(raw) {
    const regions = raw == null ? void 0 : raw.regions;
    if (typeof regions !== "object" || regions === null) return null;
    const clean = {};
    for (const [name, value] of Object.entries(regions)) {
      const region = value;
      if (typeof region !== "object" || region === null || !Array.isArray(region.dates)) return null;
      if (!region.dates.every((d) => typeof d === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)) || region.dates.length > 500) return null;
      clean[name] = { verified: region.verified === true, dates: region.dates };
    }
    return "england-and-wales" in clean ? { regions: clean } : null;
  }
  function bankHolidaysFor(onsCode) {
    const region = bankHolidays.regions[regionFor(onsCode)];
    return (region == null ? void 0 : region.verified) ? region.dates : void 0;
  }

  // src/warnings.ts
  var WARNING_LOOKBACK_DAYS = 28;
  var WARNING_LEAD_DAYS = 7;
  var WARNING_ALARM = "PT9H";
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function dayName(date) {
    return DAYS[weekdayIndex(date)];
  }
  function longDate(date) {
    return `${dayName(date)} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
  }
  function describe(change, label) {
    if (change.before && change.after) return `${label}: ${longDate(change.after)} instead of ${longDate(change.before)}.`;
    if (change.after) return `${label}: a new collection on ${longDate(change.after)}.`;
    return `${label}: the collection on ${longDate(change.before)} is no longer listed.`;
  }
  function when(eventDate, firstChange) {
    const weeks = daysBetween(addDays(eventDate, -weekdayIndex(eventDate)), addDays(firstChange, -weekdayIndex(firstChange))) / 7;
    if (weeks <= 0) return "this week";
    if (weeks === 1) return "next week";
    return `from ${longDate(firstChange)}`;
  }
  function changeWarnings(input) {
    var _a, _b, _c;
    const { id, council, garden, changes, today } = input;
    const binTypes = (_a = council.bin_types) != null ? _a : {};
    const byDay = /* @__PURE__ */ new Map();
    for (const change of changes) {
      if (change.kind !== "round_change") continue;
      if (!garden && ((_b = binTypes[change.bin_name]) == null ? void 0 : _b.stream) === "garden") continue;
      const found = change.at.slice(0, 10);
      if (daysBetween(found, today) > WARNING_LOOKBACK_DAYS) continue;
      byDay.set(found, [...(_c = byDay.get(found)) != null ? _c : [], change]);
    }
    const events = [];
    for (const [found, group] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
      const targets = group.map((c) => {
        var _a2;
        return (_a2 = c.after) != null ? _a2 : c.before;
      });
      const first = [...targets].sort()[0];
      if (daysBetween(first, today) > WARNING_LEAD_DAYS) continue;
      const date = [addDays(first, -WARNING_LEAD_DAYS), found].sort().at(-1);
      const weekdays = new Set(group.map((c) => c.after ? dayName(c.after) : ""));
      const weekdayMoved = group.every((c) => c.before && c.after && weekdayIndex(c.before) !== weekdayIndex(c.after));
      const now = weekdayMoved && weekdays.size === 1 ? `, now ${[...weekdays][0]}s` : "";
      events.push({
        uid: `${id}-change-${found}@bin-day`,
        summary: `Bin days change ${when(date, first)}${now}`,
        description: group.map((c) => {
          var _a2, _b2;
          return describe(c, (_b2 = (_a2 = binTypes[c.bin_name]) == null ? void 0 : _a2.label) != null ? _b2 : c.bin_name);
        }).join("\n"),
        start: { kind: "date", date },
        alarm: WARNING_ALARM
      });
    }
    return events;
  }

  // src/feed.ts
  var STALE_DAYS = 14;
  var UNCONFIRMED_DAYS = 8;
  var ALARM_EVENING_BEFORE = "-PT6H";
  var STREAM_ORDER = ["general", "recycling", "food", "garden"];
  var STREAM_NAME = { general: "rubbish", recycling: "recycling", food: "food", garden: "garden" };
  var UNCONFIRMED_SUMMARY = "Couldn't confirm this week's collection, check the council site";
  var SETTING_UP_SUMMARY = "Bin Day is getting your collection dates, check back tomorrow";
  function noticeEvent(id, kind, summary, today) {
    return { uid: `${id}-${kind}@bin-day`, summary, start: { kind: "date", date: today } };
  }
  function groupByDate(collections) {
    var _a;
    const groups = /* @__PURE__ */ new Map();
    for (const collection of collections) {
      groups.set(collection.date, [...(_a = groups.get(collection.date)) != null ? _a : [], collection]);
    }
    return groups;
  }
  function streamsLabel(group) {
    return STREAM_ORDER.filter((stream) => group.some((c) => c.stream === stream)).map((s) => STREAM_NAME[s]).join(" + ");
  }
  function eventFor(id, date, ordinal, group) {
    const ordered = [...group].sort((a, b) => STREAM_ORDER.indexOf(a.stream) - STREAM_ORDER.indexOf(b.stream) || a.bin_name.localeCompare(b.bin_name));
    const labels = [...new Set(ordered.map((c) => c.label))];
    const projected = group.some((c) => !c.confirmed);
    const lines = [`Put out: ${labels.join(", ")}.`];
    if (projected) lines.push("Expected date, confirmed nearer the time.");
    return {
      // Keyed on the week, not the date, so a date that moves within its week updates the event instead of duplicating it.
      uid: `${id}-${isoWeek(date)}-${ordinal}@bin-day`,
      summary: `Bins: ${streamsLabel(group)}`,
      description: lines.join("\n"),
      start: { kind: "date", date },
      alarm: ALARM_EVENING_BEFORE
    };
  }
  function buildFeed(input) {
    var _a, _b, _c;
    const { subscription, council, collections, fetchedAt, now, today, holidays } = input;
    const id = subscription.id;
    const failures = (_a = input.consecutiveFailures) != null ? _a : 0;
    const unconfirmedNotice = noticeEvent(id, "unconfirmed", UNCONFIRMED_SUMMARY, today);
    if (fetchedAt === null) {
      const notice = failures > 0 ? unconfirmedNotice : noticeEvent(id, "setup", SETTING_UP_SUMMARY, today);
      return buildCalendar("Bin Day", [notice], now);
    }
    const age = daysBetween(fetchedAt.slice(0, 10), today);
    if (age > STALE_DAYS) {
      return buildCalendar("Bin Day", [unconfirmedNotice], now);
    }
    const wanted = projectCollections({ collections, council, today, holidays }).filter(
      (collection) => subscription.garden || collection.stream !== "garden"
    );
    const events = [];
    const ordinalsByWeek = /* @__PURE__ */ new Map();
    for (const [date, group] of [...groupByDate(wanted)].sort(([a], [b]) => a.localeCompare(b))) {
      const week = isoWeek(date);
      const ordinal = ((_b = ordinalsByWeek.get(week)) != null ? _b : 0) + 1;
      ordinalsByWeek.set(week, ordinal);
      events.push(eventFor(id, date, ordinal, group));
    }
    events.push(...changeWarnings({ id, council, garden: subscription.garden, changes: (_c = input.changes) != null ? _c : [], today }));
    if (failures > 0 || age > UNCONFIRMED_DAYS) events.push(unconfirmedNotice);
    events.sort((a, b) => a.start.date.localeCompare(b.start.date));
    return buildCalendar("Bin Day", events, new Date(fetchedAt));
  }
  var FEED_TOKEN = /^[0-9a-f]{64}$/;
  function feedFor(token, deps) {
    var _a, _b, _c;
    if (!FEED_TOKEN.test(token)) return null;
    const subscription = deps.tables.findSubscription(token);
    if (!subscription) return null;
    const council = getCouncil(subscription.ons_code);
    if (!council) return null;
    deps.tables.touchSubscription(token, deps.today);
    const result = deps.tables.getResult(subscription.uprn);
    return buildFeed({
      subscription: { id: subscription.id, garden: subscription.garden },
      council,
      collections: (_a = result == null ? void 0 : result.collections) != null ? _a : [],
      fetchedAt: (_b = result == null ? void 0 : result.fetched_at) != null ? _b : null,
      now: deps.now,
      today: deps.today,
      holidays: bankHolidaysFor(subscription.ons_code),
      consecutiveFailures: (_c = result == null ? void 0 : result.consecutive_failures) != null ? _c : 0,
      changes: deps.tables.recentChanges(subscription.uprn)
    });
  }
  var UPCOMING_DAYS = 6;
  function upcomingFor(token, deps) {
    var _a;
    if (!FEED_TOKEN.test(token)) return null;
    const subscription = deps.tables.findSubscription(token);
    if (!subscription) return null;
    const council = getCouncil(subscription.ons_code);
    if (!council) return null;
    deps.tables.touchSubscription(token, deps.today);
    const result = deps.tables.getResult(subscription.uprn);
    if (!result || result.fetched_at === null) {
      return { status: ((_a = result == null ? void 0 : result.consecutive_failures) != null ? _a : 0) > 0 ? "failed" : "pending", collections: [] };
    }
    if (daysBetween(result.fetched_at.slice(0, 10), deps.today) > STALE_DAYS) return { status: "failed", collections: [] };
    const wanted = projectCollections({
      collections: result.collections,
      council,
      today: deps.today,
      holidays: bankHolidaysFor(subscription.ons_code)
    }).filter((collection) => subscription.garden || collection.stream !== "garden");
    const days = [...groupByDate(wanted)].sort(([a], [b]) => a.localeCompare(b)).slice(0, UPCOMING_DAYS).map(([date, group]) => ({ date, label: streamsLabel(group), projected: group.some((c) => !c.confirmed) }));
    return { status: "ready", collections: days };
  }

  // src/remote.ts
  var CHUNK_CHARS = 3e4;
  var MAX_CHUNKS = 30;
  function readCache(remote2, key) {
    const count = Number(remote2.cacheGet(`${key}:n`));
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;
    let text2 = "";
    for (let i = 0; i < count; i++) {
      const part = remote2.cacheGet(`${key}:${i}`);
      if (part === null) return null;
      text2 += part;
    }
    return text2;
  }
  function writeCache(remote2, key, text2, seconds) {
    const chunks = [];
    for (let i = 0; i < text2.length; i += CHUNK_CHARS) chunks.push(text2.slice(i, i + CHUNK_CHARS));
    if (chunks.length === 0 || chunks.length > MAX_CHUNKS) return;
    chunks.forEach((chunk, i) => remote2.cachePut(`${key}:${i}`, chunk, seconds));
    remote2.cachePut(`${key}:n`, String(chunks.length), seconds);
  }
  function tryParse(text2, parse) {
    try {
      return parse(JSON.parse(text2));
    } catch {
      return null;
    }
  }
  function loadJson(remote2, key, url, parse, seconds) {
    const cached = readCache(remote2, key);
    if (cached !== null) {
      const value2 = tryParse(cached, (raw) => raw);
      if (value2 !== null) return value2;
    }
    const text2 = remote2.fetchText(url);
    if (text2 === null) return null;
    const value = tryParse(text2, parse);
    if (value === null) return null;
    writeCache(remote2, key, JSON.stringify(value), seconds);
    return value;
  }

  // src/service.ts
  var DEFAULT_FEED_LIFE_DAYS = 365;
  var MIN_FEED_LIFE_DAYS = 30;
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  var STREAMS2 = ["general", "recycling", "food", "garden"];
  var CHANGE_KINDS = ["expected_shift", "round_change"];
  var MAX_MESSAGE_CHARS = 2e3;
  var MIN_MESSAGE_CHARS = 5;
  var MAX_REPLY_TO_CHARS = 200;
  var MAX_MESSAGES = 500;
  var MESSAGE_LIFE_DAYS = 365;
  var DEFAULT_MAX_SUBSCRIPTIONS = 5e3;
  var DEFAULT_MAX_PER_ADDRESS = 20;
  var DEFAULT_MAX_WAITLIST_COUNCILS = 500;
  var UPRN = /^[0-9]{1,12}$/;
  var ADDRESS_ID = /^(?:[0-9]{1,12}|h-[ENSW][0-9]{8}-[A-Z0-9]{5,7}-[a-z0-9-]{1,40})$/;
  var ONS_CODE2 = /^[ENSW][0-9]{8}$/;
  var TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$/;
  var DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  var MAX_TEXT = 500;
  var POSTCODE = /^[A-Za-z0-9][A-Za-z0-9 ]{1,9}$/;
  var HOUSE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ,'./-]{0,99}$/;
  function addressKey(onsCode, postcode, houseNumber) {
    const compact = postcode.replace(/\s+/g, "").toUpperCase();
    const house = houseNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
    const key = `h-${onsCode}-${compact}-${house}`;
    return ADDRESS_ID.test(key) ? key : null;
  }
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
  function optionalDate(value) {
    if (value === null) return null;
    return typeof value === "string" && DATE.test(value) ? value : void 0;
  }
  function validChanges(value, uprn, onsCode, at) {
    if (!Array.isArray(value) || value.length > 50) return null;
    const rows2 = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null) return null;
      const { bin_name, kind, before, after, note } = item;
      const beforeDate = optionalDate(before);
      const afterDate = optionalDate(after);
      if (typeof bin_name !== "string" || bin_name.length > 200) return null;
      if (typeof kind !== "string" || !CHANGE_KINDS.includes(kind)) return null;
      if (beforeDate === void 0 || afterDate === void 0) return null;
      if (typeof note !== "string" || note.length > 300) return null;
      rows2.push({ at, uprn, ons_code: onsCode, bin_name, kind, before: beforeDate, after: afterDate, note });
    }
    return rows2;
  }
  function validCollections(value) {
    if (!Array.isArray(value) || value.length > 200) return null;
    const rows2 = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null) return null;
      const { date, bin_name, stream } = item;
      if (typeof date !== "string" || !DATE.test(date)) return null;
      if (text(bin_name, 200) === null || typeof bin_name !== "string") return null;
      if (typeof stream !== "string" || !STREAMS2.includes(stream)) return null;
      rows2.push({ date, bin_name, stream });
    }
    return rows2;
  }
  function subscribe(request, deps) {
    var _a, _b, _c, _d;
    const { uprn, ons_code, postcode, house_number, garden } = request;
    if (typeof ons_code !== "string" || !ONS_CODE2.test(ons_code)) return fail("bad ons_code");
    if (postcode !== void 0 && !(typeof postcode === "string" && POSTCODE.test(postcode))) return fail("bad postcode");
    if (house_number !== void 0 && !(typeof house_number === "string" && HOUSE_NUMBER.test(house_number))) return fail("bad house_number");
    if (garden !== void 0 && typeof garden !== "boolean") return fail("bad garden");
    const council = getCouncil(ons_code);
    if ((council == null ? void 0 : council.status) !== "supported") return fail("council not supported yet");
    for (const input of (_a = council.inputs) != null ? _a : []) {
      if (input === "postcode" && typeof postcode !== "string") return fail("postcode needed");
      if (input === "house_number" && typeof house_number !== "string") return fail("house_number needed");
    }
    if (council.house_input === "first_line" && typeof house_number === "string" && house_number.trim().split(/[\s,]+/).filter(Boolean).length < 2) {
      return fail("first line needed");
    }
    let key;
    if (((_b = council.inputs) != null ? _b : []).includes("uprn")) {
      if (typeof uprn !== "string" || !UPRN.test(uprn)) return fail("bad uprn");
      key = uprn;
    } else {
      const made = typeof postcode === "string" && typeof house_number === "string" ? addressKey(ons_code, postcode, house_number) : null;
      if (made === null) return fail("bad address");
      key = made;
    }
    if (!deps.newToken || !deps.newId) return fail("not configured");
    const withLock = (_c = deps.withLock) != null ? _c : ((work) => work());
    const { tables } = deps;
    let added = false;
    const reply = withLock(() => {
      var _a2, _b2, _c2, _d2, _e, _f;
      if (tables.countSubscriptions() >= ((_a2 = deps.maxSubscriptions) != null ? _a2 : DEFAULT_MAX_SUBSCRIPTIONS)) return fail("full");
      if (tables.countSubscriptions(key) >= ((_b2 = deps.maxPerAddress) != null ? _b2 : DEFAULT_MAX_PER_ADDRESS)) return fail("too many feeds for this address");
      if (!tables.addresses().some((address) => address.uprn === key)) {
        const row = { uprn: key, ons_code };
        if (typeof postcode === "string") row.postcode = postcode;
        if (typeof house_number === "string") row.house_number = house_number;
        tables.addAddress(row);
        added = true;
      }
      const token = (_c2 = deps.newToken) == null ? void 0 : _c2.call(deps);
      tables.addSubscription({
        token,
        id: (_d2 = deps.newId) == null ? void 0 : _d2.call(deps),
        uprn: key,
        ons_code,
        garden: garden === true,
        created_at: (_f = (_e = deps.nowIso) == null ? void 0 : _e.call(deps)) != null ? _f : (/* @__PURE__ */ new Date()).toISOString()
      });
      return { ok: true, token };
    });
    if (added && reply.ok) {
      try {
        (_d = deps.requestFetch) == null ? void 0 : _d.call(deps);
      } catch {
      }
    }
    return reply;
  }
  function upcoming(request, deps) {
    var _a, _b;
    const { token } = request;
    if (typeof token !== "string") return fail("bad token");
    const today = (_b = (_a = deps.todayIso) == null ? void 0 : _a.call(deps)) != null ? _b : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const found = upcomingFor(token, { tables: deps.tables, today });
    return found === null ? fail("not found") : { ok: true, ...found };
  }
  function joinWaitlist(request, deps) {
    var _a;
    const { ons_code } = request;
    if (typeof ons_code !== "string" || !ONS_CODE2.test(ons_code)) return fail("bad ons_code");
    const withLock = (_a = deps.withLock) != null ? _a : ((work) => work());
    const { tables } = deps;
    return withLock(() => {
      var _a2, _b, _c;
      tables.bumpWaitlist(ons_code, (_b = (_a2 = deps.nowIso) == null ? void 0 : _a2.call(deps)) != null ? _b : (/* @__PURE__ */ new Date()).toISOString(), (_c = deps.maxWaitlistCouncils) != null ? _c : DEFAULT_MAX_WAITLIST_COUNCILS);
      return { ok: true };
    });
  }
  function cleanText(value) {
    if (typeof value !== "string") return null;
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").trim();
  }
  function contact(request, deps) {
    var _a;
    if (typeof request.website === "string" && request.website.trim() !== "") return { ok: true };
    const message = cleanText(request.message);
    if (message === null || message.length < MIN_MESSAGE_CHARS) return fail("message too short");
    if (message.length > MAX_MESSAGE_CHARS) return fail("message too long");
    let replyTo;
    if (request.reply_to !== void 0 && request.reply_to !== "") {
      const cleaned = cleanText(request.reply_to);
      if (cleaned === null || cleaned.length > MAX_REPLY_TO_CHARS || cleaned.includes("\n")) return fail("bad reply_to");
      if (cleaned !== "") replyTo = cleaned;
    }
    const withLock = (_a = deps.withLock) != null ? _a : ((work) => work());
    const { tables } = deps;
    return withLock(() => {
      var _a2, _b;
      if (tables.countMessages() >= MAX_MESSAGES) return fail("full");
      if (deps.contactAllowed && !deps.contactAllowed()) return fail("busy");
      const row = { at: (_b = (_a2 = deps.nowIso) == null ? void 0 : _a2.call(deps)) != null ? _b : (/* @__PURE__ */ new Date()).toISOString(), message };
      if (replyTo !== void 0) row.reply_to = replyTo;
      tables.addMessage(row);
      return { ok: true };
    });
  }
  function unsubscribe(request, deps) {
    var _a;
    const { token } = request;
    if (typeof token !== "string" || !FEED_TOKEN.test(token)) return fail("bad token");
    const withLock = (_a = deps.withLock) != null ? _a : ((work) => work());
    const { tables } = deps;
    return withLock(() => {
      const removed = tables.deleteSubscription(token);
      if (removed === null) return fail("not found");
      if (tables.countSubscriptions(removed.uprn) === 0) tables.deleteAddress(removed.uprn);
      return { ok: true };
    });
  }
  function handle(body, deps) {
    var _a, _b, _c;
    if (typeof body !== "object" || body === null) return fail("bad request");
    const request = body;
    if (request.action === "subscribe") return subscribe(request, deps);
    if (request.action === "join_waitlist") return joinWaitlist(request, deps);
    if (request.action === "upcoming") return upcoming(request, deps);
    if (request.action === "unsubscribe") return unsubscribe(request, deps);
    if (request.action === "contact") return contact(request, deps);
    if (deps.secret === void 0 || deps.secret === "") return fail("not configured");
    if (typeof request.secret !== "string" || !safeEqual(request.secret, deps.secret)) return fail("unauthorised");
    const withLock = (_a = deps.withLock) != null ? _a : ((work) => work());
    const { tables } = deps;
    switch (request.action) {
      case "addresses": {
        const addresses = tables.addresses().map((address) => {
          var _a2, _b2;
          return {
            ...address,
            last_attempt: (_b2 = (_a2 = tables.getResult(address.uprn)) == null ? void 0 : _a2.last_attempt) != null ? _b2 : null
          };
        });
        return { ok: true, addresses };
      }
      case "add_address": {
        const { uprn, ons_code, postcode, house_number } = request;
        if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
        if (typeof ons_code !== "string" || !ONS_CODE2.test(ons_code)) return fail("bad ons_code");
        if (postcode !== void 0 && !(typeof postcode === "string" && POSTCODE.test(postcode))) return fail("bad postcode");
        if (house_number !== void 0 && !(typeof house_number === "string" && HOUSE_NUMBER.test(house_number))) return fail("bad house_number");
        const row = { uprn, ons_code };
        if (typeof postcode === "string") row.postcode = postcode;
        if (typeof house_number === "string") row.house_number = house_number;
        withLock(() => {
          if (!tables.addresses().some((a) => a.uprn === uprn)) tables.addAddress(row);
        });
        return { ok: true };
      }
      case "get_result": {
        const { uprn } = request;
        if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
        return { ok: true, result: tables.getResult(uprn) };
      }
      case "save_changes": {
        const { uprn, ons_code, now } = request;
        if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
        if (typeof ons_code !== "string" || !ONS_CODE2.test(ons_code)) return fail("bad ons_code");
        if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
        const rows2 = validChanges(request.changes, uprn, ons_code, now);
        if (rows2 === null) return fail("bad changes");
        withLock(() => {
          if (tables.hasAddress(uprn)) tables.addChanges(rows2);
        });
        return { ok: true };
      }
      case "save_success": {
        const { uprn, now } = request;
        const collections = validCollections(request.collections);
        if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
        if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
        if (collections === null) return fail("bad collections");
        withLock(() => {
          if (!tables.hasAddress(uprn)) return;
          tables.putResult({ uprn, fetched_at: now, last_attempt: now, last_error: null, consecutive_failures: 0, collections });
        });
        return { ok: true };
      }
      case "expire_feeds": {
        const days = request.days === void 0 ? DEFAULT_FEED_LIFE_DAYS : request.days;
        if (typeof days !== "number" || !Number.isInteger(days) || days < MIN_FEED_LIFE_DAYS || days > 3650) return fail("bad days");
        const today = (_c = (_b = deps.todayIso) == null ? void 0 : _b.call(deps)) != null ? _c : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        return withLock(() => {
          var _a2;
          let expired = 0;
          let addresses = 0;
          for (const feed of tables.subscriptions()) {
            const lastUsed = ((_a2 = feed.last_used) != null ? _a2 : feed.created_at).slice(0, 10);
            if (!DAY.test(lastUsed) || !(daysBetween(lastUsed, today) > days)) continue;
            if (tables.deleteSubscription(feed.token) === null) continue;
            expired += 1;
            if (tables.countSubscriptions(feed.uprn) === 0) {
              tables.deleteAddress(feed.uprn);
              addresses += 1;
            }
          }
          const messages = tables.deleteMessagesBefore(addDays(today, -MESSAGE_LIFE_DAYS));
          return { ok: true, expired, addresses_deleted: addresses, messages_deleted: messages };
        });
      }
      case "save_failure": {
        const { uprn, now } = request;
        const error = text(request.error);
        if (typeof uprn !== "string" || !ADDRESS_ID.test(uprn)) return fail("bad uprn");
        if (typeof now !== "string" || !TIMESTAMP.test(now)) return fail("bad timestamp");
        if (error === null) return fail("bad error");
        withLock(() => {
          var _a2, _b2, _c2;
          if (!tables.hasAddress(uprn)) return;
          const previous = tables.getResult(uprn);
          tables.putResult({
            uprn,
            fetched_at: (_a2 = previous == null ? void 0 : previous.fetched_at) != null ? _a2 : null,
            last_attempt: now,
            last_error: error,
            consecutive_failures: ((_b2 = previous == null ? void 0 : previous.consecutive_failures) != null ? _b2 : 0) + 1,
            collections: (_c2 = previous == null ? void 0 : previous.collections) != null ? _c2 : []
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
  var SUBSCRIPTION_HEADERS = ["token", "id", "uprn", "ons_code", "garden", "created_at", "last_used"];
  var MESSAGE_HEADERS = ["at", "message", "reply_to"];
  var WAITLIST_HEADERS = ["ons_code", "count", "first_at", "last_at"];
  var RECENT_CHANGE_ROWS = 500;
  var CHANGE_HEADERS = ["at", "uprn", "ons_code", "bin_name", "kind", "before", "after", "note"];
  function table(name, headers, textColumns = [1]) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      for (const column of textColumns) sheet.getRange(1, column, sheet.getMaxRows(), 1).setNumberFormat("@");
    }
    return sheet;
  }
  function subscriptionsTable() {
    const sheet = table("subscriptions", SUBSCRIPTION_HEADERS, [1, 3, 7]);
    const last = SUBSCRIPTION_HEADERS.length;
    if (sheet.getRange(1, last).getValue() === "") {
      sheet.getRange(1, last).setValue("last_used");
    }
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("subscription_dates_are_text") !== "yes") {
      for (const column of [6, last]) sheet.getRange(1, column, sheet.getMaxRows(), 1).setNumberFormat("@");
      properties.setProperty("subscription_dates_are_text", "yes");
    }
    return sheet;
  }
  function subscriptionFrom(values) {
    const [token, id, uprn, onsCode, garden, createdAt, lastUsed] = values;
    const row = {
      token: String(token),
      id: String(id),
      uprn: String(uprn),
      ons_code: String(onsCode),
      garden: garden === "yes",
      created_at: cellText(createdAt, true)
    };
    const used = optional(lastUsed);
    if (used) row.last_used = cellText(lastUsed);
    return row;
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
  function cellText(value, withTime = false) {
    if (value instanceof Date) {
      return Utilities.formatDate(value, "UTC", withTime ? "yyyy-MM-dd'T'HH:mm:ss'+00:00'" : "yyyy-MM-dd");
    }
    return String(value);
  }
  function optional(value) {
    return value === "" || value === void 0 || value === null ? void 0 : String(value);
  }
  var sheetTables = {
    recentChanges(uprn) {
      const sheet = table("changes", CHANGE_HEADERS, [1, 2, 3, 4, 5, 6, 7, 8]);
      const last = sheet.getLastRow();
      if (last < 2) return [];
      const first = Math.max(2, last - RECENT_CHANGE_ROWS + 1);
      return sheet.getRange(first, 1, last - first + 1, CHANGE_HEADERS.length).getValues().filter((row) => String(row[1]) === uprn).map((row) => {
        var _a, _b;
        return {
          at: String(row[0]),
          uprn,
          ons_code: String(row[2]),
          bin_name: String(row[3]),
          kind: String(row[4]),
          before: (_a = optional(row[5])) != null ? _a : null,
          after: (_b = optional(row[6])) != null ? _b : null,
          note: String(row[7])
        };
      });
    },
    addChanges(rows2) {
      const sheet = table("changes", CHANGE_HEADERS, [1, 2, 3, 4, 5, 6, 7, 8]);
      const values = rows2.map((r) => {
        var _a, _b;
        return [r.at, r.uprn, r.ons_code, r.bin_name, r.kind, (_a = r.before) != null ? _a : "", (_b = r.after) != null ? _b : "", r.note];
      });
      if (values.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, values.length, CHANGE_HEADERS.length).setValues(values);
    },
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
      var _a, _b;
      const sheet = table("addresses", ADDRESS_HEADERS);
      sheet.appendRow([row.uprn, row.ons_code, (_a = row.postcode) != null ? _a : "", (_b = row.house_number) != null ? _b : "", (/* @__PURE__ */ new Date()).toISOString()]);
    },
    getResult(uprn) {
      var _a, _b;
      const sheet = table("results", RESULT_HEADERS);
      const rowNumber = findRow(sheet, uprn);
      if (rowNumber === null) return null;
      const [, fetchedAt, lastAttempt, lastError, failures, json2] = sheet.getRange(rowNumber, 1, 1, RESULT_HEADERS.length).getValues()[0];
      return {
        uprn,
        fetched_at: (_a = optional(fetchedAt)) != null ? _a : null,
        last_attempt: String(lastAttempt),
        last_error: (_b = optional(lastError)) != null ? _b : null,
        consecutive_failures: Number(failures) || 0,
        collections: json2 ? JSON.parse(String(json2)) : []
      };
    },
    putResult(row) {
      var _a, _b, _c;
      const sheet = table("results", RESULT_HEADERS);
      const values = [
        row.uprn,
        (_a = row.fetched_at) != null ? _a : "",
        row.last_attempt,
        (_b = row.last_error) != null ? _b : "",
        row.consecutive_failures,
        JSON.stringify(row.collections)
      ];
      const rowNumber = (_c = findRow(sheet, row.uprn)) != null ? _c : sheet.getLastRow() + 1;
      sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    },
    countSubscriptions(uprn) {
      const sheet = subscriptionsTable();
      const last = sheet.getLastRow();
      if (last < 2) return 0;
      if (uprn === void 0) return last - 1;
      return sheet.getRange(2, 3, last - 1, 1).getValues().filter((row) => String(row[0]) === uprn).length;
    },
    addSubscription(row) {
      var _a;
      const sheet = subscriptionsTable();
      sheet.appendRow([row.token, row.id, row.uprn, row.ons_code, row.garden ? "yes" : "no", row.created_at, (_a = row.last_used) != null ? _a : row.created_at.slice(0, 10)]);
    },
    findSubscription(token) {
      const sheet = subscriptionsTable();
      const rowNumber = findRow(sheet, token);
      if (rowNumber === null) return null;
      return subscriptionFrom(sheet.getRange(rowNumber, 1, 1, SUBSCRIPTION_HEADERS.length).getValues()[0]);
    },
    subscriptions() {
      return rows(subscriptionsTable()).map(subscriptionFrom);
    },
    touchSubscription(token, today) {
      const sheet = subscriptionsTable();
      const rowNumber = findRow(sheet, token);
      if (rowNumber === null) return;
      const cell = sheet.getRange(rowNumber, SUBSCRIPTION_HEADERS.length);
      if (cellText(cell.getValue()) !== today) cell.setValue(today);
    },
    addMessage(row) {
      var _a;
      const sheet = table("messages", MESSAGE_HEADERS, [1, 2, 3]);
      sheet.appendRow([row.at, row.message, (_a = row.reply_to) != null ? _a : ""]);
    },
    countMessages() {
      return Math.max(0, table("messages", MESSAGE_HEADERS, [1, 2, 3]).getLastRow() - 1);
    },
    deleteMessagesBefore(day) {
      const sheet = table("messages", MESSAGE_HEADERS, [1, 2, 3]);
      const last = sheet.getLastRow();
      if (last < 2) return 0;
      const sent = sheet.getRange(2, 1, last - 1, 1).getValues();
      let removed = 0;
      for (let i = sent.length - 1; i >= 0; i--) {
        if (cellText(sent[i][0], true).slice(0, 10) < day) {
          sheet.deleteRow(i + 2);
          removed += 1;
        }
      }
      return removed;
    },
    hasAddress(uprn) {
      return findRow(table("addresses", ADDRESS_HEADERS), uprn) !== null;
    },
    deleteSubscription(token) {
      const found = sheetTables.findSubscription(token);
      if (found === null) return null;
      const sheet = subscriptionsTable();
      const rowNumber = findRow(sheet, token);
      if (rowNumber !== null) sheet.deleteRow(rowNumber);
      return found;
    },
    deleteAddress(uprn) {
      const removeMatching = (sheet, column) => {
        const last = sheet.getLastRow();
        if (last < 2) return;
        const values = sheet.getRange(2, column, last - 1, 1).getValues();
        for (let i = values.length - 1; i >= 0; i--) if (String(values[i][0]) === uprn) sheet.deleteRow(i + 2);
      };
      removeMatching(table("addresses", ADDRESS_HEADERS), 1);
      removeMatching(table("results", RESULT_HEADERS), 1);
      removeMatching(table("changes", CHANGE_HEADERS, [1, 2, 3, 4, 5, 6, 7, 8]), 2);
    },
    bumpWaitlist(onsCode, at, maxCouncils) {
      const sheet = table("waitlist", WAITLIST_HEADERS, [1, 3, 4]);
      const rowNumber = findRow(sheet, onsCode);
      if (rowNumber !== null) {
        const count = Number(sheet.getRange(rowNumber, 2).getValue()) || 0;
        sheet.getRange(rowNumber, 2, 1, 3).setValues([[count + 1, sheet.getRange(rowNumber, 3).getValue(), at]]);
      } else if (sheet.getLastRow() - 1 < maxCouncils) {
        sheet.appendRow([onsCode, 1, at, at]);
      }
    }
  };

  // src/main.ts
  var DEFAULT_REPO = "nialltm-bit/bin-day";
  var REGISTRY_SECONDS = 600;
  var BANK_HOLIDAY_SECONDS = 3600;
  function rawUrl(path) {
    const repo = PropertiesService.getScriptProperties().getProperty("GITHUB_REPO");
    const name = repo && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo) ? repo : DEFAULT_REPO;
    return `https://raw.githubusercontent.com/${name}/main/${path}`;
  }
  var remote = {
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
      }
    }
  };
  function refreshData() {
    try {
      const councils2 = loadJson(remote, "registry", rawUrl("registry/councils.json"), slimCouncils, REGISTRY_SECONDS);
      if (councils2) setCouncils(councils2);
      const learned2 = loadJson(remote, "learned", rawUrl("registry/learned-frequencies.json"), parseLearnedFrequencies, REGISTRY_SECONDS);
      if (learned2) setLearnedFrequencies(learned2);
      const holidays = loadJson(remote, "bankholidays", rawUrl("registry/bank-holidays.json"), parseBankHolidays, BANK_HOLIDAY_SECONDS);
      if (holidays) setBankHolidays(holidays);
    } catch (error) {
      console.error(`Using the bundled council list: ${error instanceof Error ? error.name : "error"}`);
    }
  }
  function json(body) {
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }
  function doGet(e) {
    var _a, _b;
    if (((_a = e == null ? void 0 : e.parameter) == null ? void 0 : _a.feed) === "poc") {
      const now = /* @__PURE__ */ new Date();
      const today = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
      const calendar = buildCalendar("Bin Day PoC", pocEvents(today), now);
      return ContentService.createTextOutput(calendar).setMimeType(ContentService.MimeType.ICAL);
    }
    const token = (_b = e == null ? void 0 : e.parameter) == null ? void 0 : _b.feed;
    if (token && token !== "poc") {
      refreshData();
      const now = /* @__PURE__ */ new Date();
      const today = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
      const calendar = FEED_TOKEN.test(token) ? feedFor(token, { tables: sheetTables, now, today }) : null;
      if (calendar === null) return json({ ok: false, error: "not found" });
      return ContentService.createTextOutput(calendar).setMimeType(ContentService.MimeType.ICAL);
    }
    return json({ ok: true, service: "bin-day", time: (/* @__PURE__ */ new Date()).toISOString() });
  }
  function randomHex(parts) {
    let hex = "";
    for (let i = 0; i < parts; i++) hex += Utilities.getUuid().replace(/-/g, "");
    return hex;
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
  var MAX_FETCH_REQUESTS_PER_HOUR = 20;
  var MAX_CONTACT_MESSAGES_PER_HOUR = 20;
  function contactAllowed() {
    const properties = PropertiesService.getScriptProperties();
    const key = `contact_messages_${Utilities.formatDate(/* @__PURE__ */ new Date(), "UTC", "yyyyMMddHH")}`;
    const used = Number(properties.getProperty(key)) || 0;
    if (used >= MAX_CONTACT_MESSAGES_PER_HOUR) return false;
    properties.setProperty(key, String(used + 1));
    return true;
  }
  function dispatchFetch() {
    const properties = PropertiesService.getScriptProperties();
    const token = properties.getProperty("GITHUB_TOKEN");
    const repo = properties.getProperty("GITHUB_REPO");
    if (!token || !repo || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) return null;
    const response = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/actions/workflows/fetch-scheduled.yml/dispatches`, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      payload: JSON.stringify({ ref: "main" }),
      muteHttpExceptions: true
    });
    return response.getResponseCode();
  }
  function requestFetch() {
    try {
      const properties = PropertiesService.getScriptProperties();
      const key = `fetch_requests_${Utilities.formatDate(/* @__PURE__ */ new Date(), "UTC", "yyyyMMddHH")}`;
      const used = Number(properties.getProperty(key)) || 0;
      if (used >= MAX_FETCH_REQUESTS_PER_HOUR) return;
      properties.setProperty(key, String(used + 1));
      const code = dispatchFetch();
      if (code !== null && code !== 204) console.error(`Asking GitHub for a fetch failed: HTTP ${code}`);
    } catch (error) {
      console.error(`Asking GitHub for a fetch failed: ${error instanceof Error ? error.name : "error"}`);
    }
  }
  function testFetchRequest() {
    const code = dispatchFetch();
    console.log(code === null ? "Not set up: add the GITHUB_TOKEN and GITHUB_REPO script properties." : `GitHub answered HTTP ${code} (204 means the fetch was requested).`);
  }
  function doPost(e) {
    var _a, _b, _c;
    let body;
    try {
      body = JSON.parse((_b = (_a = e == null ? void 0 : e.postData) == null ? void 0 : _a.contents) != null ? _b : "null");
    } catch {
      return json({ ok: false, error: "body is not JSON" });
    }
    if (typeof body === "object" && body !== null && "action" in body) {
      refreshData();
      const properties = PropertiesService.getScriptProperties();
      const secret = (_c = properties.getProperty("FETCHER_SECRET")) != null ? _c : void 0;
      const max = Number(properties.getProperty("MAX_SUBSCRIPTIONS"));
      return json(
        handle(body, {
          secret,
          tables: sheetTables,
          withLock: withScriptLock,
          newToken: () => randomHex(2),
          newId: () => randomHex(1).slice(0, 8),
          nowIso: () => (/* @__PURE__ */ new Date()).toISOString(),
          todayIso: () => Utilities.formatDate(/* @__PURE__ */ new Date(), "Europe/London", "yyyy-MM-dd"),
          requestFetch,
          contactAllowed,
          maxSubscriptions: max > 0 ? max : void 0
        })
      );
    }
    return json({ ok: true, received: body });
  }
  Object.assign(globalThis, { __binDay: { doGet, doPost, testFetchRequest } });
})();
function doGet(e) { return globalThis.__binDay.doGet(e); }
function doPost(e) { return globalThis.__binDay.doPost(e); }
function testFetchRequest() { return globalThis.__binDay.testFetchRequest(); }

