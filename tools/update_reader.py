"""Refresh the README issue index for the GitHub Pages reader."""

import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://zmperfect.github.io/playtrace-weekly/"
START = "<!-- weekly-index:start -->"
END = "<!-- weekly-index:end -->"


def main():
    issues = json.loads((ROOT / "dist/data/issues.json").read_text(encoding="utf-8"))["issues"]
    lines = []
    for index, issue in enumerate(sorted(issues, key=lambda i: i["date"], reverse=True)):
        label = "阅读本期" if index == 0 else "阅读"
        titles = "、".join(re.sub(r"[\r\n]+", " ", game["title"]) for game in issue["games"])
        # Titles come from store feeds. Escape Markdown punctuation in the index.
        titles = re.sub(r"([\\`*_[\]<>|~])", r"\\\1", titles)
        lines.append(f'- [{label} · {issue["id"]}]({SITE}#issue/{issue["id"]})　{titles}')
    path = ROOT / "README.md"
    source = path.read_text(encoding="utf-8")
    before, marker, rest = source.partition(START)
    _, end, after = rest.partition(END)
    if not marker or not end:
        raise ValueError("Weekly index markers are missing from README.md")
    updated = before + START + "\n\n" + "\n".join(lines) + "\n\n" + END + after
    if updated != source:
        path.write_text(updated, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
