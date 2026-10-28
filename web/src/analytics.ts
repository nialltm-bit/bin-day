/**
 * Visit counting with GoatCounter (goatcounter.com): no cookies, no browser storage, no tracking across sites and no
 * personal profile. The address of the person's own GoatCounter site is set at build time (it is public: it appears in the
 * page), so counting is simply off until it is set. A browser that asks not to be tracked is not counted.
 */

const COUNT_SCRIPT = "https://gc.zgo.at/count.js";

/** The endpoint if it is an https address of the form https://NAME.goatcounter.com/count, otherwise null. */
export function goatCounterEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const ok = url.protocol === "https:" && /^[a-z0-9-]+\.goatcounter\.com$/.test(url.hostname) && url.pathname === "/count" && url.search === "" && url.username === "";
  return ok ? `${url.origin}/count` : null;
}

interface Page {
  createElement(tag: "script"): { async: boolean; src: string; setAttribute(name: string, value: string): void };
  head: { append(node: never): void };
}

export function addGoatCounter(value: string | undefined, page: Page = document as unknown as Page, doNotTrack: string | null | undefined = navigator.doNotTrack): boolean {
  const endpoint = goatCounterEndpoint(value);
  if (endpoint === null || doNotTrack === "1") return false;
  const script = page.createElement("script");
  script.async = true;
  script.setAttribute("data-goatcounter", endpoint);
  script.src = COUNT_SCRIPT;
  page.head.append(script as never);
  return true;
}
