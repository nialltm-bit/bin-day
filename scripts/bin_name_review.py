"""Lists the councils the generator left out because a bin name can't be settled, for a person to decide.

Reads the batch probe, the council-site evidence (scripts/map_bin_colours.py) and the registry. Writes a markdown file with, per
council, each bin name the keyword rules can't settle, why, and what the council's own pages said. Nothing here changes the
registry: a person picks the stream and adds the name to a registry entry (registry/README.md), or tells the generator the stream.

Usage: bin_name_review.py <upstream input.json> <batch-probe.json> <bin-colour-evidence.json> <registry councils.json> <out .md>
"""
import json
import sys

from fetcher.streams import canonical_name, is_ignored, stream_for, streams_in


def why(name: str) -> str:
    found = streams_in(name)
    if len(found) > 1:
        return "says several streams (" + ", ".join(sorted(found)) + "), so one stream would drop a collection"
    return "a colour or code with no stream word in it"


def main(input_path, probe_path, evidence_path, registry_path, out_path):
    upstream = json.load(open(input_path))
    probe = json.load(open(probe_path))["results"]
    evidence = json.load(open(evidence_path))
    registered = {c["source"].get("module") for c in json.load(open(registry_path))["councils"]}
    lines = ["# Bin names to settle by hand", "",
             "Councils that probed cleanly but have a bin whose stream the keyword rules can't settle (`fetcher/streams.py`). The name is never "
             "guessed. `Council's own pages` is what `scripts/map_bin_colours.py` read on the council's website: the stream each page "
             "implied and how many pages said so. A single page is not enough to decide.", ""]
    count = 0
    for row in sorted(probe, key=lambda r: r["module"]):
        if row["module"] in registered or not row.get("ok"):
            continue
        open_names = [canonical_name(n) for n in row["bins"] if not is_ignored(n) and stream_for(canonical_name(n)) is None]
        if not open_names:
            continue
        count += 1
        seen = evidence.get(row["module"], {}).get("bins", {})
        lines += [f"## {upstream[row['module']]['wiki_name']} (`{row['module']}`)", "",
                  "Bins returned: " + ", ".join(f"`{n}`" for n in row["bins"]), ""]
        for name in open_names:
            votes = (seen.get(name) or {}).get("votes") or {}
            pages = ", ".join(f"{s}: {n}" for s, n in sorted(votes.items())) or "nothing found"
            lines.append(f"- `{name}`: {why(name)}. Council's own pages: {pages}.")
        lines.append("")
    lines.insert(3, f"{count} councils.")
    lines.insert(4, "")
    open(out_path, "w").write("\n".join(lines) + "\n")
    print(count, "councils need a person")


if __name__ == "__main__":
    main(*sys.argv[1:6])
