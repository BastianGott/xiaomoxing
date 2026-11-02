#!/usr/bin/env python3
import subprocess, sys
from pathlib import Path
R = Path(__file__).parent
if subprocess.call([sys.executable, str(R / "build_data.py")]) != 0:
    sys.exit("data build failed")
data = (R / "data.json").read_text(encoding="utf-8").replace("</", "<\\/")
js = "\n".join((R / "src" / f).read_text(encoding="utf-8") for f in ["core.js", "ui.js", "games.js", "idioms.js", "sentences.js", "dialogues.js", "screens.js"])
js = js.replace("/*__DATA__*/null", data, 1)
css = (R / "src" / "style.css").read_text(encoding="utf-8")
html = (R / "src" / "template.html").read_text(encoding="utf-8").replace("/*__CSS__*/", css).replace("/*__JS__*/", js)
out = R / "dist" / "xiaomoxing.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print("wrote", out, f"{out.stat().st_size/1024:.0f} KB")
