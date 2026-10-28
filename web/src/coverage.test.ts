import { describe, expect, it } from "vitest";
import councilData from "../../registry/councils.json";
import { type CouncilEntry, type Outcome, canAskForHouseNumber, classifyCouncil, lookup, messageFor, normalisePostcode } from "./coverage";

const REAL = (councilData as { councils: CouncilEntry[] }).councils;
const FAKE: CouncilEntry[] = [
  { ons_code: "E06000099", name: "Numberton", status: "supported", inputs: ["postcode", "house_number"] },
  { ons_code: "E06000098", name: "Brokenshire", status: "broken", inputs: ["postcode", "house_number"] },
  { ons_code: "E06000097", name: "Nowhere Yet", status: "unsupported" },
  { ons_code: "E06000096", name: "Uprnton", status: "supported", inputs: ["uprn"] },
  { ons_code: "E06000095", name: "Both", status: "supported", inputs: ["uprn", "postcode", "house_number"] },
  { ons_code: "E06000094", name: "Lineton", status: "supported", inputs: ["postcode", "house_number"], house_input: "first_line" },
];

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as typeof fetch;
}
const answer = (result: Record<string, unknown>) => fakeFetch(200, { status: 200, result });

describe("normalisePostcode", () => {
  it("fixes case and spacing", () => {
    expect(normalisePostcode("ba1  5aw")).toBe("BA1 5AW");
    expect(normalisePostcode("  M11AE ")).toBe("M1 1AE");
    expect(normalisePostcode("EC1A1BB")).toBe("EC1A 1BB");
    expect(normalisePostcode("W1A 0AX")).toBe("W1A 0AX");
  });

  it("rejects things that are not postcodes", () => {
    for (const bad of ["", "hello", "12345", "BA1", "BA1 5A", "BA1 5AWW", "=1+1", "BA1 5AW; drop", "BA1-5AW"]) {
      expect(normalisePostcode(bad), bad).toBeNull();
    }
  });
});

describe("classifyCouncil", () => {
  const pick = (code: string) => classifyCouncil("AA1 1AA", code, "From the service", FAKE).kind;

  it("is ready only when the council is supported and takes a house number without a UPRN", () => {
    expect(pick("E06000099")).toBe("ready");
  });

  it("asks for the whole first line where the council's system needs it, and says so in the words shown", () => {
    const out = classifyCouncil("AA1 1AA", "E06000094", "x", FAKE);
    expect(out).toMatchObject({ kind: "ready", ask: "first_line" });
    expect(messageFor(out).detail).toMatch(/first line of your address/);
    expect(messageFor(classifyCouncil("AA1 1AA", "E06000099", "x", FAKE)).detail).toBe("Enter your house number or name.");
  });

  it("with the real registry, Newcastle is ready and asks for the first line", () => {
    expect(classifyCouncil("NE3 4XE", "E08000021", "Newcastle upon Tyne", REAL)).toMatchObject({ kind: "ready", ask: "first_line" });
  });

  it("does not offer a council that needs a UPRN while nothing can find one, even if it also lists a house number", () => {
    expect(pick("E06000096")).toBe("council_needs_address_lookup");
    expect(pick("E06000095")).toBe("council_needs_address_lookup");
  });

  it("offers a UPRN council as an address list once a UPRN finder exists, and not before", () => {
    const withFinder = (code: string) => classifyCouncil("AA1 1AA", code, "x", FAKE, true);
    expect(withFinder("E06000096")).toMatchObject({ kind: "ready", ask: "address_list" });
    expect(withFinder("E06000095")).toMatchObject({ kind: "ready", ask: "address_list" });
    expect(withFinder("E06000099")).toMatchObject({ kind: "ready", ask: "house_number" });
    expect(withFinder("E06000098").kind).toBe("council_unavailable");
    expect(withFinder("E06000097").kind).toBe("council_not_covered");
    expect(classifyCouncil("BA1 5AW", "E06000022", "Bath", REAL, true)).toMatchObject({ kind: "ready", ask: "address_list" });
  });

  it("says a broken source is unavailable, not unsupported", () => {
    expect(pick("E06000098")).toBe("council_unavailable");
  });

  it("treats unsupported and unlisted councils as not covered, using the name we have", () => {
    expect(pick("E06000097")).toBe("council_not_covered");
    expect(classifyCouncil("AA1 1AA", "E06000001", "Hartlepool", FAKE)).toMatchObject({ kind: "council_not_covered", name: "Hartlepool" });
  });

  it("with the real registry, B&NES is not offered until we can find an address from a UPRN-only source", () => {
    const bnes = REAL.find((c) => c.ons_code === "E06000022") as CouncilEntry;
    expect(canAskForHouseNumber(bnes)).toBe(false);
    expect(classifyCouncil("BA1 5AW", "E06000022", "Bath", REAL).kind).toBe("council_needs_address_lookup");
  });
});

describe("lookup", () => {
  const run = (postcode: string, f: typeof fetch) => lookup(postcode, { fetch: f, councils: FAKE });

  it("never calls the service for a malformed postcode", async () => {
    let called = false;
    const f = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    expect(await run("nope", f)).toEqual({ kind: "bad_postcode" });
    expect(called).toBe(false);
  });

  it("finds a ready council from the service's admin district code", async () => {
    const f = answer({ country: "England", admin_district: "Numberton", codes: { admin_district: "E06000099" } });
    expect(await run("aa1 1aa", f)).toEqual({ kind: "ready", postcode: "AA1 1AA", ons_code: "E06000099", name: "Numberton", ask: "house_number" });
  });

  it("reports a postcode the service doesn't know", async () => {
    expect(await run("AA1 1AA", fakeFetch(404, { status: 404, error: "Invalid postcode" }))).toEqual({
      kind: "postcode_not_found",
      postcode: "AA1 1AA",
    });
  });

  it("says the lookup failed, and guesses nothing, when the service errors, is unreachable or sends rubbish", async () => {
    const down = (async () => {
      throw new TypeError("network");
    }) as typeof fetch;
    for (const f of [fakeFetch(500, "oops"), fakeFetch(429, "slow down"), down, fakeFetch(200, "not json"), fakeFetch(200, { status: 200 }), fakeFetch(200, { result: null })]) {
      expect(await run("AA1 1AA", f)).toEqual({ kind: "lookup_failed" });
    }
  });

  it("does not place Channel Islands or Isle of Man postcodes", async () => {
    for (const country of ["Channel Islands", "Isle of Man"]) {
      expect((await run("GY1 1AA", answer({ country, codes: { admin_district: null } }))).kind).toBe("outside_coverage");
    }
  });

  it("does not guess when the service gives no council, or a code that isn't an authority code", async () => {
    for (const codes of [{}, { admin_district: null }, { admin_district: "nonsense" }, { admin_district: "E0600009" }]) {
      expect((await run("AA1 1AA", answer({ country: "England", codes }))).kind).toBe("council_unknown");
    }
    expect((await run("AA1 1AA", answer({ country: "England" }))).kind).toBe("council_unknown");
  });

  it("cleans the service's council name before it can reach the page", async () => {
    const name = `  ${"x".repeat(200)}  `;
    const out = await run("AA1 1AA", answer({ country: "England", admin_district: name, codes: { admin_district: "E06000001" } }));
    expect(out).toMatchObject({ kind: "council_not_covered" });
    expect((out as { name: string }).name.length).toBeLessThanOrEqual(80);
    const blank = await run("AA1 1AA", answer({ country: "England", admin_district: "   ", codes: { admin_district: "E06000001" } }));
    expect((blank as { name: string }).name).toBe("your council");
  });
});

describe("messageFor", () => {
  const outcomes: Outcome[] = [
    { kind: "bad_postcode" },
    { kind: "postcode_not_found", postcode: "AA1 1AA" },
    { kind: "lookup_failed" },
    { kind: "outside_coverage", postcode: "GY1 1AA" },
    { kind: "council_unknown", postcode: "AA1 1AA" },
    { kind: "council_not_covered", postcode: "AA1 1AA", ons_code: "E06000001", name: "Hartlepool" },
    { kind: "council_needs_address_lookup", postcode: "AA1 1AA", ons_code: "E06000022", name: "Bath" },
    { kind: "council_unavailable", postcode: "AA1 1AA", ons_code: "E06000098", name: "Brokenshire" },
    { kind: "ready", postcode: "AA1 1AA", ons_code: "E06000099", name: "Numberton", ask: "house_number" },
  ];

  it("has words for every outcome", () => {
    for (const outcome of outcomes) {
      const message = messageFor(outcome);
      expect(message.headline.length, outcome.kind).toBeGreaterThan(0);
      expect(message.detail.length, outcome.kind).toBeGreaterThan(0);
    }
  });

  it("never promises to tell anyone anything or asks for contact details", () => {
    for (const outcome of outcomes) {
      const text = `${messageFor(outcome).headline} ${messageFor(outcome).detail}`.toLowerCase();
      expect(text, outcome.kind).not.toMatch(/we'll (tell|let|email|notify|contact)|we will (tell|let|email|notify|contact)|leave your email|your email/);
    }
  });

  it("offers the count only where a council could be added, and carries only the council code", () => {
    for (const outcome of outcomes) {
      const message = messageFor(outcome);
      const offered = outcome.kind === "council_not_covered" || outcome.kind === "council_needs_address_lookup";
      expect(message.waitlist !== undefined, outcome.kind).toBe(offered);
      if (message.waitlist) expect(Object.keys(message.waitlist)).toEqual(["ons_code"]);
    }
  });

  it("points everyone who can't get bin days here to somewhere else that can", () => {
    for (const outcome of outcomes) {
      const message = messageFor(outcome);
      const stuck = !["ready", "bad_postcode", "postcode_not_found", "lookup_failed"].includes(outcome.kind);
      expect(message.help !== undefined, outcome.kind).toBe(stuck);
      if (message.help) expect(message.help.url).toMatch(/^https:\/\/www\.gov\.uk\//);
    }
  });
});
