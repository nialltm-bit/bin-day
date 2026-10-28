import { describe, expect, it } from "vitest";
import { addGoatCounter, goatCounterEndpoint } from "./analytics";

function fakePage() {
  const added: { async: boolean; src: string; attrs: Record<string, string> }[] = [];
  return {
    added,
    page: {
      createElement: () => {
        const node = { async: false, src: "", attrs: {} as Record<string, string>, setAttribute(name: string, value: string) { node.attrs[name] = value; } };
        return node;
      },
      head: { append: (node: never) => void added.push(node) },
    },
  };
}

describe("goatCounterEndpoint", () => {
  it("accepts a GoatCounter count address", () => {
    expect(goatCounterEndpoint("https://binday.goatcounter.com/count")).toBe("https://binday.goatcounter.com/count");
    expect(goatCounterEndpoint("  https://bin-day2.goatcounter.com/count ")).toBe("https://bin-day2.goatcounter.com/count");
  });
  it("refuses anything else, so a typo can't point the page at another site", () => {
    for (const bad of [undefined, "", "binday", "http://binday.goatcounter.com/count", "https://evil.example/count", "https://goatcounter.com.evil.example/count", "https://binday.goatcounter.com/other", "https://binday.goatcounter.com/count?x=1", "https://u:p@binday.goatcounter.com/count"]) {
      expect(goatCounterEndpoint(bad)).toBeNull();
    }
  });
});

describe("addGoatCounter", () => {
  it("adds GoatCounter's script, pointed at the endpoint", () => {
    const { page, added } = fakePage();
    expect(addGoatCounter("https://binday.goatcounter.com/count", page, null)).toBe(true);
    expect(added[0].src).toBe("https://gc.zgo.at/count.js");
    expect(added[0].async).toBe(true);
    expect(added[0].attrs["data-goatcounter"]).toBe("https://binday.goatcounter.com/count");
  });
  it("does nothing when no address is set", () => {
    const { page, added } = fakePage();
    expect(addGoatCounter(undefined, page, null)).toBe(false);
    expect(added).toEqual([]);
  });
  it("does nothing when the browser asks not to be tracked", () => {
    const { page, added } = fakePage();
    expect(addGoatCounter("https://binday.goatcounter.com/count", page, "1")).toBe(false);
    expect(added).toEqual([]);
  });
});
