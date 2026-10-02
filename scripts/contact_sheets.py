#!/usr/bin/env python3
"""
גיליונות סקירה (contact sheets) לתמונות המאגר — כדי לעבור בעין על כל
התמונות ולוודא שאין בהן שלט או כיתוב שחושף את שם המקום.

שימוש: python3 scripts/contact_sheets.py [places.json] [out-dir]
דורש Pillow (pip install pillow).
"""
import io
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else "data/places.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "review"
COLS, ROWS = 4, 4
CELL_W, CELL_H, LABEL_H = 400, 300, 26
UA = "EifoZeBot/1.0 (https://github.com/yuvada70/Eifo-Ze; content review)"

data = json.load(open(SRC, encoding="utf-8"))
if isinstance(data, dict) and "places" in data:
    entries = [(p["id"], p["image"]["file"]) for p in data["places"]]
else:
    # candidates.json: {id: [file, ...]} — מועמדות לבחירה ידנית
    entries = [(f"{pid}#{k}", f) for pid, files in data.items() for k, f in enumerate(files)]


def url_for(file):
    name = file.replace(" ", "_")
    return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name) + "?width=500"


def fetch(entry):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url_for(entry[1]), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as res:
                img = Image.open(io.BytesIO(res.read())).convert("RGB")
                img.thumbnail((CELL_W, CELL_H))
                return img
        except Exception as error:  # noqa: BLE001
            time.sleep(2 * (attempt + 1))
            last = error
    print("FAILED", entry[0], last, flush=True)
    return None


with ThreadPoolExecutor(max_workers=4) as pool:
    images = list(pool.map(fetch, entries))

import os

os.makedirs(OUT, exist_ok=True)
try:
    font = ImageFont.load_default(size=18)
except TypeError:
    font = ImageFont.load_default()

per_sheet = COLS * ROWS
index_lines = []
for sheet_no in range(0, len(entries), per_sheet):
    sheet = Image.new("RGB", (COLS * CELL_W, ROWS * (CELL_H + LABEL_H)), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    for k, (entry, img) in enumerate(zip(entries[sheet_no : sheet_no + per_sheet], images[sheet_no : sheet_no + per_sheet])):
        x = (k % COLS) * CELL_W
        y = (k // COLS) * (CELL_H + LABEL_H)
        if img is not None:
            sheet.paste(img, (x + (CELL_W - img.width) // 2, y + (CELL_H - img.height) // 2))
        else:
            draw.text((x + 10, y + CELL_H // 2), "LOAD FAILED", fill=(255, 80, 80), font=font)
        draw.rectangle([x, y + CELL_H, x + CELL_W, y + CELL_H + LABEL_H], fill=(0, 0, 0))
        draw.text((x + 6, y + CELL_H + 3), f"{sheet_no + k}: {entry[0]}", fill=(255, 255, 0), font=font)
    name = f"sheet-{sheet_no // per_sheet:02d}.jpg"
    sheet.save(os.path.join(OUT, name), quality=72)
    index_lines.append(name)
print("sheets:", len(index_lines))
