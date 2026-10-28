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

const councils = (councilData as unknown as { councils: Council[] }).councils;

export function getCouncil(onsCode: string): Council | undefined {
  return councils.find((council) => council.ons_code === onsCode);
}

/** England and Wales share bank holidays; S is Scotland and N is Northern Ireland. */
export function regionFor(onsCode: string): string {
  return onsCode.startsWith("E") || onsCode.startsWith("W") ? "england-and-wales" : onsCode.startsWith("S") ? "scotland" : "northern-ireland";
}

interface Region {
  verified: boolean;
  dates: string[];
}

/** Bank holiday dates for the council's region, or undefined unless that region has been verified. */
export function bankHolidaysFor(onsCode: string): string[] | undefined {
  const regions = (bankHolidayData as unknown as { regions: Record<string, Region> }).regions;
  const region = regions[regionFor(onsCode)];
  return region?.verified ? region.dates : undefined;
}
