"""Build the static Pages reader with its matching UI and archive URLs."""

import hashlib
import json
from pathlib import Path
import re
import shutil
import sys


def package(source, output):
    shutil.copytree(source, output)
    index = output / "index.html"
    html = index.read_text(encoding="utf-8")

    # A cached document must run the UI it was built with. Keep the flat files
    # too, since earlier releases of the reader still request them.
    scripts = []

    def embed_script(match):
        code = (source / match[1]).read_text(encoding="utf-8")
        if "</script" in code.lower():
            raise ValueError(f"Cannot inline {match[1]} with a closing script tag")
        scripts.append(f"<script>\n{code}\n</script>")
        return ""

    def embed_style(match):
        css = (source / match[1]).read_text(encoding="utf-8")
        if "</style" in css.lower():
            raise ValueError(f"Cannot inline {match[1]} with a closing style tag")
        return f"<style>\n{css}\n</style>"

    html = re.sub(r'<script src="\./([^"/]+\.js)" defer></script>', embed_script, html)
    html = re.sub(r'<link rel="stylesheet" href="\./([^"/]+\.css)">', embed_style, html)
    if not scripts or "</body>" not in html:
        raise ValueError("Missing reader scripts or body in index.html")

    archives = {}
    for archive in sorted((source / "data").glob("*.json")):
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()[:16]
        filename = f"{archive.stem}.{digest}.json"
        shutil.copyfile(archive, output / "data" / filename)
        archives[archive.stem] = f"./data/{filename}"
    manifest = json.dumps(archives).replace("<", "\\u003c")
    scripts.insert(0, f'<script id="archive-files" type="application/json">{manifest}</script>')
    html = html.replace("</body>", "\n".join(scripts) + "\n</body>", 1)
    index.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    package(Path(__file__).resolve().parents[1] / "dist", Path(sys.argv[1]))
