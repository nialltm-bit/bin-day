import type { AddressRow, ChangeRow, CollectionRow, ResultRow, SubscriptionRow, Tables } from "./service";

const ADDRESS_HEADERS = ["uprn", "ons_code", "postcode", "house_number", "created_at"];
const RESULT_HEADERS = ["uprn", "fetched_at", "last_attempt", "last_error", "consecutive_failures", "collections_json"];
const SUBSCRIPTION_HEADERS = ["token", "id", "uprn", "ons_code", "garden", "created_at", "last_used"];
const WAITLIST_HEADERS = ["ons_code", "count", "first_at", "last_at"];
const RECENT_CHANGE_ROWS = 500;
const CHANGE_HEADERS = ["at", "uprn", "ons_code", "bin_name", "kind", "before", "after", "note"];

function table(name: string, headers: string[], textColumns: number[] = [1]): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    // Keep identifiers as text so a UPRN is never turned into a number.
    for (const column of textColumns) sheet.getRange(1, column, sheet.getMaxRows(), 1).setNumberFormat("@");
  }
  return sheet;
}

/** The subscriptions tab. A tab made before `last_used` existed gets the new heading the first time it is used. */
function subscriptionsTable(): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = table("subscriptions", SUBSCRIPTION_HEADERS, [1, 3, 7]);
  const last = SUBSCRIPTION_HEADERS.length;
  if (sheet.getRange(1, last).getValue() === "") {
    sheet.getRange(1, last).setValue("last_used");
  }
  // Keep both dates as text, so Sheets doesn't turn them into dates. Done once, not on every read; rows already stored as
  // dates are read back as text by cellText.
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty("subscription_dates_are_text") !== "yes") {
    for (const column of [6, last]) sheet.getRange(1, column, sheet.getMaxRows(), 1).setNumberFormat("@");
    properties.setProperty("subscription_dates_are_text", "yes");
  }
  return sheet;
}

function subscriptionFrom(values: unknown[]): SubscriptionRow {
  const [token, id, uprn, onsCode, garden, createdAt, lastUsed] = values;
  const row: SubscriptionRow = {
    token: String(token),
    id: String(id),
    uprn: String(uprn),
    ons_code: String(onsCode),
    garden: garden === "yes",
    created_at: cellText(createdAt, true),
  };
  const used = optional(lastUsed);
  if (used) row.last_used = cellText(lastUsed);
  return row;
}

function rows(sheet: GoogleAppsScript.Spreadsheet.Sheet): unknown[][] {
  const last = sheet.getLastRow();
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
}

function findRow(sheet: GoogleAppsScript.Spreadsheet.Sheet, uprn: string): number | null {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const column = sheet.getRange(2, 1, last - 1, 1).getValues();
  const index = column.findIndex((row) => String(row[0]) === uprn);
  return index === -1 ? null : index + 2;
}

/**
 * A cell as text. Sheets turns something that looks like a date into a date, and reading it back gives a Date, so a date
 * is written out in the same form the script stores: YYYY-MM-DD, or a full timestamp when `withTime` is set.
 */
function cellText(value: unknown, withTime = false): string {
  if (value instanceof Date) {
    return Utilities.formatDate(value, "UTC", withTime ? "yyyy-MM-dd'T'HH:mm:ss'+00:00'" : "yyyy-MM-dd");
  }
  return String(value);
}

function optional(value: unknown): string | undefined {
  return value === "" || value === undefined || value === null ? undefined : String(value);
}

export const sheetTables: Tables = {
  recentChanges(uprn: string): ChangeRow[] {
    // Only the latest rows are read, so a long history doesn't slow every feed request.
    const sheet = table("changes", CHANGE_HEADERS, [1, 2, 3, 4, 5, 6, 7, 8]);
    const last = sheet.getLastRow();
    if (last < 2) return [];
    const first = Math.max(2, last - RECENT_CHANGE_ROWS + 1);
    return sheet
      .getRange(first, 1, last - first + 1, CHANGE_HEADERS.length)
      .getValues()
      .filter((row) => String(row[1]) === uprn)
      .map((row) => ({
        at: String(row[0]),
        uprn,
        ons_code: String(row[2]),
        bin_name: String(row[3]),
        kind: String(row[4]),
        before: optional(row[5]) ?? null,
        after: optional(row[6]) ?? null,
        note: String(row[7]),
      }));
  },

  addChanges(rows: ChangeRow[]): void {
    // Every column is text, so Sheets leaves the ISO dates and timestamps as they are.
    const sheet = table("changes", CHANGE_HEADERS, [1, 2, 3, 4, 5, 6, 7, 8]);
    const values = rows.map((r) => [r.at, r.uprn, r.ons_code, r.bin_name, r.kind, r.before ?? "", r.after ?? "", r.note]);
    if (values.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, values.length, CHANGE_HEADERS.length).setValues(values);
  },

  addresses(): AddressRow[] {
    return rows(table("addresses", ADDRESS_HEADERS)).map((row) => {
      const address: AddressRow = { uprn: String(row[0]), ons_code: String(row[1]) };
      const postcode = optional(row[2]);
      const houseNumber = optional(row[3]);
      if (postcode) address.postcode = postcode;
      if (houseNumber) address.house_number = houseNumber;
      return address;
    });
  },

  addAddress(row: AddressRow): void {
    const sheet = table("addresses", ADDRESS_HEADERS);
    sheet.appendRow([row.uprn, row.ons_code, row.postcode ?? "", row.house_number ?? "", new Date().toISOString()]);
  },

  getResult(uprn: string): ResultRow | null {
    const sheet = table("results", RESULT_HEADERS);
    const rowNumber = findRow(sheet, uprn);
    if (rowNumber === null) return null;
    const [, fetchedAt, lastAttempt, lastError, failures, json] = sheet.getRange(rowNumber, 1, 1, RESULT_HEADERS.length).getValues()[0];
    return {
      uprn,
      fetched_at: optional(fetchedAt) ?? null,
      last_attempt: String(lastAttempt),
      last_error: optional(lastError) ?? null,
      consecutive_failures: Number(failures) || 0,
      collections: (json ? JSON.parse(String(json)) : []) as CollectionRow[],
    };
  },

  putResult(row: ResultRow): void {
    const sheet = table("results", RESULT_HEADERS);
    const values = [
      row.uprn,
      row.fetched_at ?? "",
      row.last_attempt,
      row.last_error ?? "",
      row.consecutive_failures,
      JSON.stringify(row.collections),
    ];
    const rowNumber = findRow(sheet, row.uprn) ?? sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  },

  countSubscriptions(uprn?: string): number {
    const sheet = subscriptionsTable();
    const last = sheet.getLastRow();
    if (last < 2) return 0;
    if (uprn === undefined) return last - 1;
    return sheet
      .getRange(2, 3, last - 1, 1)
      .getValues()
      .filter((row) => String(row[0]) === uprn).length;
  },

  addSubscription(row: SubscriptionRow): void {
    const sheet = subscriptionsTable();
    sheet.appendRow([row.token, row.id, row.uprn, row.ons_code, row.garden ? "yes" : "no", row.created_at, row.last_used ?? row.created_at.slice(0, 10)]);
  },

  findSubscription(token: string): SubscriptionRow | null {
    const sheet = subscriptionsTable();
    const rowNumber = findRow(sheet, token);
    if (rowNumber === null) return null;
    return subscriptionFrom(sheet.getRange(rowNumber, 1, 1, SUBSCRIPTION_HEADERS.length).getValues()[0]);
  },

  subscriptions(): SubscriptionRow[] {
    return rows(subscriptionsTable()).map(subscriptionFrom);
  },

  touchSubscription(token: string, today: string): void {
    const sheet = subscriptionsTable();
    const rowNumber = findRow(sheet, token);
    if (rowNumber === null) return;
    const cell = sheet.getRange(rowNumber, SUBSCRIPTION_HEADERS.length);
    if (cellText(cell.getValue()) !== today) cell.setValue(today); // at most one write a day, however often a calendar app asks
  },

  hasAddress(uprn: string): boolean {
    return findRow(table("addresses", ADDRESS_HEADERS), uprn) !== null;
  },

  deleteSubscription(token: string): SubscriptionRow | null {
    const found = sheetTables.findSubscription(token);
    if (found === null) return null;
    const sheet = subscriptionsTable();
    const rowNumber = findRow(sheet, token);
    if (rowNumber !== null) sheet.deleteRow(rowNumber);
    return found;
  },

  deleteAddress(uprn: string): void {
    // From the bottom up, so deleting a row doesn't move the ones still to check.
    const removeMatching = (sheet: GoogleAppsScript.Spreadsheet.Sheet, column: number) => {
      const last = sheet.getLastRow();
      if (last < 2) return;
      const values = sheet.getRange(2, column, last - 1, 1).getValues();
      for (let i = values.length - 1; i >= 0; i--) if (String(values[i][0]) === uprn) sheet.deleteRow(i + 2);
    };
    removeMatching(table("addresses", ADDRESS_HEADERS), 1);
    removeMatching(table("results", RESULT_HEADERS), 1);
    removeMatching(table("changes", CHANGE_HEADERS, [1, 2, 3, 4, 5, 6, 7, 8]), 2);
  },

  bumpWaitlist(onsCode: string, at: string, maxCouncils: number): void {
    const sheet = table("waitlist", WAITLIST_HEADERS, [1, 3, 4]);
    const rowNumber = findRow(sheet, onsCode);
    if (rowNumber !== null) {
      const count = Number(sheet.getRange(rowNumber, 2).getValue()) || 0;
      sheet.getRange(rowNumber, 2, 1, 3).setValues([[count + 1, sheet.getRange(rowNumber, 3).getValue(), at]]);
    } else if (sheet.getLastRow() - 1 < maxCouncils) {
      sheet.appendRow([onsCode, 1, at, at]);
    }
  },
};
