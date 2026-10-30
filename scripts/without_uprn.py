"""Make upstream's test inputs treat UPRN councils that can also look an address up by postcode and house number as
councils that take a postcode and house number.

Some upstream modules take a UPRN, but when none is given they search the postcode and pick the address that starts with
the house number (the census calls them "UPRN councils that also read a postcode and a house number"). For those this
drops `uprn` from the test input, so the batch probe (batch_probe.py) and the registry generator (generate_registry.py)
handle them like any other postcode-and-number council. The probe is the real test: a module that only reads the number
for something else just fails or returns nothing, and is left out.

Only modules whose own source reads a postcode and a house number (paon / house_number) are changed, and only when
upstream's test input already has both. Everything else is copied as it is.

Usage: without_uprn.py <upstream input.json> <modules dir> <output input.json>
"""
import json
import re
import sys
from pathlib import Path


def reads_postcode_and_number(source: str) -> bool:
    text = source.lower()
    return "postcode" in text and bool(re.search(r"\b(paon|house_number)\b", text))


def convert(inputs: dict, source_of) -> tuple[dict, list[str]]:
    """The inputs with `uprn` removed where the module can search by postcode and number, and which modules those were."""
    out, changed = {}, []
    for name, entry in inputs.items():
        out[name] = entry
        if not (entry.get("uprn") and entry.get("postcode") and entry.get("house_number")):
            continue
        source = source_of(name)
        if source is not None and reads_postcode_and_number(source):
            out[name] = {k: v for k, v in entry.items() if k != "uprn"}
            changed.append(name)
    return out, changed


def main(input_path, modules_dir, out_path):
    folder = Path(modules_dir)

    def source_of(name):
        path = folder / f"{name}.py"
        return path.read_text(encoding="utf-8") if path.exists() else None

    out, changed = convert(json.load(open(input_path)), source_of)
    json.dump(out, open(out_path, "w"), indent=2)
    print(f"{len(changed)} UPRN councils treated as postcode-and-number councils:", ", ".join(sorted(changed)))


if __name__ == "__main__":
    main(*sys.argv[1:4])
