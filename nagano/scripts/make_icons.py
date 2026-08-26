#!/usr/bin/env python3
"""Generate a watercolor-style Shinshu (Nagano) app icon set for 信州まちしるべ.

北アルプスの稜線・そばの花・道しるべを組み合わせた和風水彩アイコンを書き出します。
    python3 scripts/make_icons.py
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(77)

SIZE = 1024
OUT = "/home/user/app/nagano/icons"

paper = (246, 240, 228, 255)
indigo = (45, 78, 118, 255)
indigo_soft = (104, 141, 178, 255)
matcha = (92, 138, 108, 255)
gold = (194, 148, 62, 255)
apple = (178, 58, 52, 255)
cream = (253, 250, 243, 255)
ink = (46, 42, 38, 255)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bg = Image.new("RGBA", (SIZE, SIZE), paper)


def blob(target, cx, cy, r, color, alpha):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = []
    n = 14
    for i in range(n):
        ang = 2 * math.pi * i / n
        rr = r * (0.8 + 0.35 * random.random())
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=(*color[:3], alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(SIZE * 0.035))
    target.alpha_composite(layer)


blob(bg, SIZE * 0.26, SIZE * 0.20, SIZE * 0.32, indigo_soft, 110)
blob(bg, SIZE * 0.80, SIZE * 0.24, SIZE * 0.28, gold, 95)
blob(bg, SIZE * 0.74, SIZE * 0.80, SIZE * 0.32, matcha, 100)
blob(bg, SIZE * 0.20, SIZE * 0.78, SIZE * 0.27, indigo_soft, 80)
img.alpha_composite(bg)

draw = ImageDraw.Draw(img)

# ---- 奥の稜線（薄い藍） ----
draw.polygon(
    [
        (0, SIZE * 0.62),
        (SIZE * 0.14, SIZE * 0.40),
        (SIZE * 0.26, SIZE * 0.52),
        (SIZE * 0.42, SIZE * 0.28),
        (SIZE * 0.58, SIZE * 0.50),
        (SIZE * 0.72, SIZE * 0.34),
        (SIZE, SIZE * 0.60),
        (SIZE, SIZE * 0.70),
        (0, SIZE * 0.70),
    ],
    fill=(*indigo_soft[:3], 190),
)

# ---- 手前の稜線（濃い藍）と雪 ----
peaks = [
    (0, SIZE * 0.74),
    (SIZE * 0.18, SIZE * 0.52),
    (SIZE * 0.32, SIZE * 0.66),
    (SIZE * 0.50, SIZE * 0.38),
    (SIZE * 0.66, SIZE * 0.62),
    (SIZE * 0.82, SIZE * 0.48),
    (SIZE, SIZE * 0.72),
    (SIZE, SIZE * 0.80),
    (0, SIZE * 0.80),
]
draw.polygon(peaks, fill=indigo)
# 雪冠
draw.polygon([(SIZE * 0.50, SIZE * 0.38), (SIZE * 0.575, SIZE * 0.50), (SIZE * 0.425, SIZE * 0.50)], fill=cream)
draw.polygon([(SIZE * 0.82, SIZE * 0.48), (SIZE * 0.875, SIZE * 0.565), (SIZE * 0.765, SIZE * 0.565)], fill=cream)
draw.polygon([(SIZE * 0.18, SIZE * 0.52), (SIZE * 0.235, SIZE * 0.605), (SIZE * 0.125, SIZE * 0.605)], fill=cream)

# ---- 里（若草の帯） ----
draw.polygon(
    [(0, SIZE * 0.80), (SIZE, SIZE * 0.80), (SIZE, SIZE), (0, SIZE)],
    fill=(*matcha[:3], 235),
)

# ---- 道（里から奥へ） ----
draw.polygon(
    [
        (SIZE * 0.40, SIZE * 0.80),
        (SIZE * 0.53, SIZE * 0.80),
        (SIZE * 0.72, SIZE),
        (SIZE * 0.18, SIZE),
    ],
    fill=(*paper[:3], 245),
)

# ---- 道しるべ（柱＋二枚の板） ----
pole_x = SIZE * 0.795
draw.rectangle([pole_x - SIZE * 0.014, SIZE * 0.60, pole_x + SIZE * 0.014, SIZE * 0.95], fill=(122, 96, 68, 255))
draw.polygon(
    [
        (pole_x - SIZE * 0.16, SIZE * 0.635),
        (pole_x + SIZE * 0.05, SIZE * 0.635),
        (pole_x + SIZE * 0.09, SIZE * 0.675),
        (pole_x + SIZE * 0.05, SIZE * 0.715),
        (pole_x - SIZE * 0.16, SIZE * 0.715),
    ],
    fill=gold,
)
draw.polygon(
    [
        (pole_x + SIZE * 0.15, SIZE * 0.745),
        (pole_x - SIZE * 0.04, SIZE * 0.745),
        (pole_x - SIZE * 0.08, SIZE * 0.785),
        (pole_x - SIZE * 0.04, SIZE * 0.825),
        (pole_x + SIZE * 0.15, SIZE * 0.825),
    ],
    fill=apple,
)

# ---- そばの花（白い小花） ----
def soba_flower(cx, cy, r):
    for i in range(5):
        ang = 2 * math.pi * i / 5 - math.pi / 2
        px = cx + r * 0.85 * math.cos(ang)
        py = cy + r * 0.85 * math.sin(ang)
        draw.ellipse([px - r * 0.62, py - r * 0.62, px + r * 0.62, py + r * 0.62], fill=cream)
    draw.ellipse([cx - r * 0.34, cy - r * 0.34, cx + r * 0.34, cy + r * 0.34], fill=gold)


for cx, cy, r in [
    (SIZE * 0.16, SIZE * 0.855, SIZE * 0.042),
    (SIZE * 0.30, SIZE * 0.92, SIZE * 0.052),
    (SIZE * 0.085, SIZE * 0.955, SIZE * 0.044),
    (SIZE * 0.44, SIZE * 0.865, SIZE * 0.034),
]:
    soba_flower(cx, cy, r)

img.save(f"{OUT}/icon-source.png")


def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), paper)
        inner = img.resize((size - pad * 2, size - pad * 2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), paper[:3])
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)


export(192, f"{OUT}/icon-192.png")
export(512, f"{OUT}/icon-512.png")
export(192, f"{OUT}/icon-maskable-192.png", maskable=True)
export(512, f"{OUT}/icon-maskable-512.png", maskable=True)
export(180, f"{OUT}/apple-touch-icon.png", opaque=True)
export(32, f"{OUT}/favicon-32.png")
export(16, f"{OUT}/favicon-16.png")

print("icons generated")
