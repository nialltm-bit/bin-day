export function feedLinks(webAppUrl: string): { https: string; webcal: string } | null {
  let url: URL;
  try {
    url = new URL(webAppUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  url.searchParams.set("feed", "poc");
  return { https: url.toString(), webcal: url.toString().replace(/^https:/, "webcal:") };
}

export function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  const hint =
    error instanceof TypeError
      ? "A TypeError from fetch usually means the browser blocked the response (cross-origin) or the URL is wrong."
      : "";
  return `Failed: ${name}. ${hint}`.trim();
}
