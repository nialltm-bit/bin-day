import type { AddressRow, CollectionRow, ResultRow, Tables } from "./service";

const ADDRESS_HEADERS = ["uprn", "ons_code", "postcode", "house_number", "created_at"];
const RESULT_HEADERS = ["uprn", "fetched_at", "last_attempt", "last_error", "consecutive_failures", "collections_json"];

function table(name: string, headers: string[]): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    // Keep identifiers as text so a UPRN is never turned into a number.
    sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat("@");
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
};
