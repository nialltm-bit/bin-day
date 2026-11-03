/** The https and webcal links for a person's feed, from the web app URL and their feed token. */
export function feedLinksForToken(webAppUrl: string, token: string): { https: string; webcal: string } | null {
  let url: URL;
  try {
    url = new URL(webAppUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^[0-9a-f]{64}$/.test(token)) return null;
  url.searchParams.set("feed", token);
  return { https: url.toString(), webcal: url.toString().replace(/^https:/, "webcal:") };
}
