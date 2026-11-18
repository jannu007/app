#!/usr/bin/env python3
"""どうぶつ言の葉のアイコン（和紙＋水彩のにじみ＋吹き出し＋肉球）を生成する。"""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

random.seed(11)
SIZE = 1024
OUT = Path(__file__).resolve().parent.parent / "icons"
PAPER = (250, 244, 231, 255)
AKANE = (190, 92, 58)
TAKE = (82, 128, 108)
GOLD = (196, 149, 63)
INK = (58, 46, 40, 255)

img = Image.new("RGBA", (SIZE, SIZE), PAPER)


def blob(cx, cy, r, color, alpha):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = []
    for i in range(16):
        ang = 2 * math.pi * i / 16
        rr = r * (0.8 + 0.35 * random.random())
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=(*color, alpha))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(SIZE * 0.035)))


blob(SIZE * 0.28, SIZE * 0.26, SIZE * 0.32, AKANE, 120)
blob(SIZE * 0.76, SIZE * 0.70, SIZE * 0.34, TAKE, 120)
blob(SIZE * 0.78, SIZE * 0.22, SIZE * 0.2, GOLD, 100)

# 吹き出し
bubble = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bd = ImageDraw.Draw(bubble)
x0, y0, x1, y1 = SIZE * 0.17, SIZE * 0.2, SIZE * 0.83, SIZE * 0.72
bd.rounded_rectangle([x0, y0, x1, y1], radius=SIZE * 0.16, fill=PAPER, outline=INK, width=int(SIZE * 0.022))
tail = [(SIZE * 0.3, y1 - SIZE * 0.02), (SIZE * 0.24, SIZE * 0.86), (SIZE * 0.45, y1 - SIZE * 0.02)]
bd.polygon(tail, fill=PAPER)
bd.line([tail[0], tail[1], tail[2]], fill=INK, width=int(SIZE * 0.022), joint="curve")
img.alpha_composite(bubble)

# 肉球（茜色）
paw = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
pd = ImageDraw.Draw(paw)
cx, cy = SIZE * 0.5, SIZE * 0.5
pd.ellipse([cx - SIZE * 0.12, cy - SIZE * 0.03, cx + SIZE * 0.12, cy + SIZE * 0.15], fill=(*AKANE, 255))
for dx, dy, r in [(-0.175, -0.07, 0.048), (-0.068, -0.155, 0.052), (0.068, -0.155, 0.052), (0.175, -0.07, 0.048)]:
    px, py, rr = cx + SIZE * dx, cy + SIZE * dy, SIZE * r
    pd.ellipse([px - rr, py - rr * 1.15, px + rr, py + rr * 1.15], fill=(*AKANE, 255))
img.alpha_composite(paw)

OUT.mkdir(exist_ok=True)
img.save(OUT / "icon-source.png")


def export(size, name, maskable=False, opaque=False):
    if maskable:
        pad = int(size * 0.12)
        im = Image.new("RGBA", (size, size), PAPER)
        im.alpha_composite(img.resize((size - pad * 2, size - pad * 2), Image.LANCZOS), (pad, pad))
    else:
        im = img.resize((size, size), Image.LANCZOS)
    if opaque:
        im = im.convert("RGB")
    im.save(OUT / name, optimize=True)


export(192, "icon-192.png")
export(512, "icon-512.png")
export(192, "icon-maskable-192.png", maskable=True)
export(512, "icon-maskable-512.png", maskable=True)
export(180, "apple-touch-icon.png", opaque=True)
export(32, "favicon-32.png")
export(16, "favicon-16.png")
print("icons generated")
