import { describeError, feedLinks } from "./poc-helpers";

const urlInput = document.getElementById("url") as HTMLInputElement;
const result = document.getElementById("result") as HTMLElement;
const feed = document.getElementById("feed") as HTMLElement;

async function call(init?: RequestInit): Promise<void> {
  result.textContent = "Calling...";
  try {
    const response = await fetch(urlInput.value.trim(), init);
    result.textContent = `HTTP ${response.status}\n${await response.text()}`;
  } catch (error) {
    result.textContent = describeError(error);
  }
}

urlInput.addEventListener("input", () => {
  const links = feedLinks(urlInput.value);
  feed.textContent = "";
  if (!links) return;
  for (const [label, href] of [
    ["Feed (https)", links.https],
    ["Feed (webcal, for Apple Calendar)", links.webcal],
  ]) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = `${label}: ${href}`;
    feed.append(anchor, document.createElement("br"));
  }
});

document.getElementById("get")?.addEventListener("click", () => void call());
document.getElementById("post")?.addEventListener("click", () =>
  void call({
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ hello: "from GitHub Pages", sentAt: new Date().toISOString() }),
  }),
);
