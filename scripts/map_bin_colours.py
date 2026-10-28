"""Work out what a council's colour-only bin names mean, from the council's own website, with no one reading it for us.

A bin called "Green" is the garden bin at some councils and the glass or recycling bin at others, so the name alone can't
be mapped. This finds the council's own pages about bins (it starts at the home page of the site upstream's module uses and
follows links that look like bin, waste or recycling pages, a handful of pages and politely), then reads the sentences that
mention the bin's name next to a word like bin, bag or box and counts which kind of waste those sentences talk about. A name
is mapped only when one kind clearly wins: at least three sentences, and the runner-up has under a third as many. Anything
less clear is left out, and the evidence is saved either way so a mapping can be checked.

Usage: map_bin_colours.py <upstream input.json> <batch-probe.json> <output json>
The output is public: council module names, bin names, short stream counts and page addresses on council sites only.
"""
import importlib.util
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("generate_registry", HERE / "generate_registry.py")
generate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generate)

MAX_PAGES = 12
PAUSE_SECONDS = 1.5
MIN_VOTES = 3
USER_AGENT = "bin-day-research/1.0 (+https://github.com/nialltm-bit/bin-day; reads public council bin pages)"
LINK_WORDS = re.compile(r"bin|waste|recycl|rubbish|refuse|garden|collection", re.I)
CONTAINER = re.compile(r"\b(bin|bins|bag|bags|box|boxes|sack|sacks|caddy|caddies|container|containers|wheelie)\b", re.I)
# Words that say what a bin is for. Colours are left out on purpose: they are what we are trying to decode.
EVIDENCE_WORDS = {
    "food": ("food",),
    "garden": ("garden", "green waste", "grass", "hedge", "prunings"),
    "recycling": ("recycl", "paper", "cardboard", "glass", "plastic", "tins", "cans", "bottles", "dry mixed"),
    "general": ("general waste", "refuse", "rubbish", "residual", "non-recyclable", "landfill", "household waste"),
}
FILLER = {"bin", "bins", "bag", "bags", "box", "empty", "wheeled", "litre", "l", "lt", "sack", "caddy", "the", "of", "for"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text: list[str] = []
        self.links: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)
        if tag in ("p", "li", "br", "tr", "h1", "h2", "h3", "h4", "div"):
            self.text.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.text.append(data)


def fetch(url: str) -> str | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if "html" not in response.headers.get("Content-Type", ""):
                return None
            return response.read(2_000_000).decode("utf-8", "replace")
    except Exception:
        return None


def crawl(start: str) -> list[tuple[str, str]]:
    """Up to MAX_PAGES (address, text) pairs from the council's site, starting at its home page."""
    host = urllib.parse.urlparse(start).netloc
    queue, seen, pages = [start], {start}, []
    while queue and len(pages) < MAX_PAGES:
        url = queue.pop(0)
        html = fetch(url)
        time.sleep(PAUSE_SECONDS)
        if html is None:
            continue
        parser = Page()
        parser.feed(html)
        pages.append((url, re.sub(r"[ \t\r\f\v]+", " ", "".join(parser.text))))
        for href in parser.links:
            link = urllib.parse.urldefrag(urllib.parse.urljoin(url, href))[0]
            if urllib.parse.urlparse(link).netloc == host and link not in seen and LINK_WORDS.search(link):
                seen.add(link)
                queue.append(link)
    return pages


def name_pattern(bin_name: str) -> re.Pattern | None:
    words = [w for w in re.findall(r"[a-z]+", bin_name.lower()) if w not in FILLER]
    return re.compile(r"\b" + r"\W+".join(map(re.escape, words)) + r"\b", re.I) if words else None


def votes_for(pattern: re.Pattern, pages: list[tuple[str, str]]) -> tuple[Counter, list[str]]:
    votes: Counter = Counter()
    used: list[str] = []
    for url, text in pages:
        for sentence in re.split(r"[.!?\n]+", text):
            if not pattern.search(sentence) or not CONTAINER.search(sentence):
                continue
            lowered = sentence.lower()
            kinds = {stream for stream, words in EVIDENCE_WORDS.items() if any(w in lowered for w in words)}
            if len(kinds) == 1:  # a sentence listing several kinds of waste doesn't say which one this bin is
                votes[kinds.pop()] += 1
                if url not in used:
                    used.append(url)
    return votes, used


def decide(votes: Counter) -> str | None:
    ranked = votes.most_common()
    if not ranked or ranked[0][1] < MIN_VOTES:
        return None
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    return ranked[0][0] if runner_up * 3 < ranked[0][1] else None


def main(input_path: str, probe_path: str, output_path: str) -> None:
    upstream = json.load(open(input_path))
    probe = json.load(open(probe_path))["results"]
    result: dict = {}
    for row in probe:
        if not row.get("ok"):
            continue
        names = [
            n
            for n in row["bins"]
            if not generate.streams_in(n) and not any(w in n.lower() for w in generate.IGNORED_WORDS)
        ]
        if not names:
            continue
        url = upstream[row["module"]]["url"]
        parts = urllib.parse.urlparse(url)
        pages = crawl(f"{parts.scheme}://{parts.netloc}/")
        found = {}
        for name in names:
            pattern = name_pattern(name)
            votes, used = votes_for(pattern, pages) if pattern else (Counter(), [])
            found[name] = {"stream": decide(votes), "votes": dict(votes), "pages": used[:5]}
        result[row["module"]] = {"pages_read": len(pages), "bins": found}
        print(row["module"], {n: (f["stream"], f["votes"]) for n, f in found.items()}, flush=True)
    json.dump(result, open(output_path, "w"), indent=2, ensure_ascii=False)
    open(output_path, "a").write("\n")


if __name__ == "__main__":
    main(*sys.argv[1:4])
