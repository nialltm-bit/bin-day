/**
 * The council registry, which maps bins, frequencies and schedules.
 *
 * A copy is bundled into the script as a fallback. main.ts replaces it with the live copy from GitHub (see remote.ts), so
 * adding councils needs no redeploy. The bundled copy is only used if the live one can't be loaded.
 */
import bankHolidayData from "../../registry/bank-holidays.json";
import councilData from "../../registry/councils.json";

export type Stream = "general" | "recycling" | "food" | "garden";

export interface BinType {
  stream: Stream;
  label?: string;
  colour?: string;
  every_weeks?: number;
}

export interface Council {
  ons_code: string;
  name: string;
  status: "supported" | "unsupported" | "broken";
  schedule?: "next_only" | "full";
  inputs?: string[];
  house_input?: "number_or_name" | "first_line";
  bin_types?: Record<string, BinType>;
}

const BUNDLED_COUNCILS = (councilData as unknown as { councils: Council[] }).councils;
let councils: Council[] = BUNDLED_COUNCILS;

export function getCouncil(onsCode: string): Council | undefined {
  return councils.find((council) => council.ons_code === onsCode);
}

/** Replaces the registry the script uses, for example with the live copy. */
export function setCouncils(list: Council[]): void {
  councils = list;
}

/** Goes back to the bundled registry. For tests. */
export function resetRegistry(): void {
  councils = BUNDLED_COUNCILS;
  bankHolidays = BUNDLED_BANK_HOLIDAYS;
}

const ONS_CODE = /^[ENSW][0-9]{8}$/;
const STREAMS: readonly string[] = ["general", "recycling", "food", "garden"];
const STATUSES: readonly string[] = ["supported", "unsupported", "broken"];
const INPUTS: readonly string[] = ["uprn", "postcode", "house_number"];
const MAX_COUNCILS = 2000;

function slimBinTypes(value: unknown): Record<string, BinType> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const slim: Record<string, BinType> = {};
  for (const [name, raw] of Object.entries(value)) {
    const bin = raw as Record<string, unknown> | null;
    if (name.length > 200 || typeof bin !== "object" || bin === null || !STREAMS.includes(bin.stream as string)) return null;
    const entry: BinType = { stream: bin.stream as Stream };
    if (typeof bin.label === "string" && bin.label.length <= 200) entry.label = bin.label;
    if (typeof bin.every_weeks === "number" && Number.isInteger(bin.every_weeks) && bin.every_weeks >= 1 && bin.every_weeks <= 4) entry.every_weeks = bin.every_weeks;
    slim[name] = entry;
  }
  return slim;
}

/**
 * Turns the registry file into the small shape the script needs, checking it as it goes. An entry that doesn't pass is
 * left out (so that council simply isn't supported, which is a safe way to fail), and a file with no usable council at
 * all is refused so the script keeps what it has.
 */
export function slimCouncils(raw: unknown): Council[] | null {
  const list = (raw as { councils?: unknown } | null)?.councils;
  if (!Array.isArray(list) || list.length > MAX_COUNCILS) return null;
  const slim: Council[] = [];
  for (const item of list) {
    const c = item as Record<string, unknown> | null;
    if (typeof c !== "object" || c === null) continue;
    if (typeof c.ons_code !== "string" || !ONS_CODE.test(c.ons_code)) continue;
    if (typeof c.name !== "string" || c.name === "" || c.name.length > 200) continue;
    if (!STATUSES.includes(c.status as string)) continue;
    const council: Council = { ons_code: c.ons_code, name: c.name, status: c.status as Council["status"] };
    if (c.schedule === "next_only" || c.schedule === "full") council.schedule = c.schedule;
    if (Array.isArray(c.inputs) && c.inputs.every((i) => INPUTS.includes(i as string))) council.inputs = c.inputs as string[];
    if (c.house_input === "number_or_name" || c.house_input === "first_line") council.house_input = c.house_input;
    if (c.bin_types !== undefined) {
      const bins = slimBinTypes(c.bin_types);
      if (bins === null) continue;
      council.bin_types = bins;
    }
    slim.push(council);
  }
  return slim.length > 0 ? slim : null;
}

/** England and Wales share bank holidays; S is Scotland and N is Northern Ireland. */
export function regionFor(onsCode: string): string {
  return onsCode.startsWith("E") || onsCode.startsWith("W") ? "england-and-wales" : onsCode.startsWith("S") ? "scotland" : "northern-ireland";
}

interface Region {
  verified: boolean;
  dates: string[];
}

export interface BankHolidayData {
  regions: Record<string, Region>;
}

const BUNDLED_BANK_HOLIDAYS = bankHolidayData as unknown as BankHolidayData;
let bankHolidays: BankHolidayData = BUNDLED_BANK_HOLIDAYS;

/** Replaces the bank holidays the script uses, for example with the live copy. */
export function setBankHolidays(data: BankHolidayData): void {
  bankHolidays = data;
}

/** Checks the bank holiday file and keeps only what the script reads. Null if it isn't usable. */
export function parseBankHolidays(raw: unknown): BankHolidayData | null {
  const regions = (raw as { regions?: unknown } | null)?.regions;
  if (typeof regions !== "object" || regions === null) return null;
  const clean: Record<string, Region> = {};
  for (const [name, value] of Object.entries(regions)) {
    const region = value as { verified?: unknown; dates?: unknown } | null;
    if (typeof region !== "object" || region === null || !Array.isArray(region.dates)) return null;
    if (!region.dates.every((d) => typeof d === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)) || region.dates.length > 500) return null;
    clean[name] = { verified: region.verified === true, dates: region.dates as string[] };
  }
  return "england-and-wales" in clean ? { regions: clean } : null;
}

/** Bank holiday dates for the council's region, or undefined unless that region has been verified. */
export function bankHolidaysFor(onsCode: string): string[] | undefined {
  const region = bankHolidays.regions[regionFor(onsCode)];
  return region?.verified ? region.dates : undefined;
}
