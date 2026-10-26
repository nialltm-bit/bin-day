import { describeError, feedLinksForToken } from "./poc-helpers";

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const result = document.getElementById("result") as HTMLElement;
const links = document.getElementById("links") as HTMLElement;

document.getElementById("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  void subscribe();
});

async function subscribe(): Promise<void> {
  result.textContent = "Working...";
  links.textContent = "";
  try {
    const response = await fetch(field("url").value.trim(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "subscribe",
        ons_code: field("ons").value.trim(),
        uprn: field("uprn").value.trim(),
        garden: field("garden").checked,
      }),
    });
    const reply = (await response.json()) as { ok: boolean; token?: string; error?: string };
    if (!reply.ok || !reply.token) {
      result.textContent = `The script said no: ${reply.error ?? "unknown error"}`;
      return;
    }
    const feed = feedLinksForToken(field("url").value, reply.token);
    result.textContent = "Done. These links are private to you: anyone with a link can see these bin days, so don't post them.";
    if (!feed) return;
    for (const [label, href] of [
      ["https (Google Calendar, Outlook)", feed.https],
      ["webcal (Apple Calendar)", feed.webcal],
    ]) {
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.textContent = `${label}: ${href}`;
      links.append(anchor, document.createElement("br"));
    }
  } catch (error) {
    result.textContent = describeError(error);
  }
}
