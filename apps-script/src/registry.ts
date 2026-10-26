/** The council registry, bundled into the script so it can map bins, frequencies and schedules. */
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
  bin_types?: Record<string, BinType>;
}

const councils = (councilData as { councils: Council[] }).councils;

export function getCouncil(onsCode: string): Council | undefined {
  return councils.find((council) => council.ons_code === onsCode);
}

/** England and Wales share bank holidays. Scotland and Northern Ireland are not built yet. */
export function regionFor(onsCode: string): string {
  return onsCode.startsWith("E") || onsCode.startsWith("W") ? "england-and-wales" : onsCode.startsWith("S") ? "scotland" : "northern-ireland";
}

/** Bank holiday dates for the council's region, or undefined if we don't know them. */
export function bankHolidaysFor(onsCode: string): string[] | undefined {
  const data = bankHolidayData as unknown as Record<string, unknown>;
  const dates = data[regionFor(onsCode)];
  return Array.isArray(dates) ? (dates as string[]) : undefined;
}
