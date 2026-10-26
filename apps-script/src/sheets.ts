import type { AddressRow, CollectionRow, ResultRow, SubscriptionRow, Tables } from "./service";

const ADDRESS_HEADERS = ["uprn", "ons_code", "postcode", "house_number", "created_at"];
const RESULT_HEADERS = ["uprn", "fetched_at", "last_attempt", "last_error", "consecutive_failures", "collections_json"];
const SUBSCRIPTION_HEADERS = ["token", "id", "uprn", "ons_code", "garden", "created_at"];

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

function optional(value: unknown): string | undefined {
  return value === "" || value === undefined || value === null ? undefined : String(value);
}

export const sheetTables: Tables = {
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
    const sheet = table("subscriptions", SUBSCRIPTION_HEADERS, [1, 3]);
    const last = sheet.getLastRow();
    if (last < 2) return 0;
    if (uprn === undefined) return last - 1;
    return sheet
      .getRange(2, 3, last - 1, 1)
      .getValues()
      .filter((row) => String(row[0]) === uprn).length;
  },

  addSubscription(row: SubscriptionRow): void {
    const sheet = table("subscriptions", SUBSCRIPTION_HEADERS, [1, 3]);
    sheet.appendRow([row.token, row.id, row.uprn, row.ons_code, row.garden ? "yes" : "no", row.created_at]);
  },

  findSubscription(token: string): SubscriptionRow | null {
    const sheet = table("subscriptions", SUBSCRIPTION_HEADERS, [1, 3]);
    const rowNumber = findRow(sheet, token);
    if (rowNumber === null) return null;
    const [, id, uprn, onsCode, garden, createdAt] = sheet.getRange(rowNumber, 1, 1, SUBSCRIPTION_HEADERS.length).getValues()[0];
    return { token, id: String(id), uprn: String(uprn), ons_code: String(onsCode), garden: garden === "yes", created_at: String(createdAt) };
  },
};
