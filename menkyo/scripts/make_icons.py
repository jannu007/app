#!/usr/bin/env python3
"""Generate a watercolor-style signpost-and-road app icon set for 免許みちしるべ."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(45)

SIZE = 1024
OUT = "/home/user/app/menkyo/icons"

paper = (244, 238, 226, 255)
indigo = (47, 93, 140, 255)
indigo_soft = (96, 142, 184, 255)
matcha = (94, 140, 122, 255)
gold = (196, 149, 63, 255)
vermillion = (176, 58, 46, 255)
ink = (48, 42, 36, 255)
cream = (250, 246, 236, 255)

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


blob(bg, SIZE * 0.24, SIZE * 0.22, SIZE * 0.32, indigo_soft, 105)
blob(bg, SIZE * 0.78, SIZE * 0.26, SIZE * 0.29, gold, 100)
blob(bg, SIZE * 0.72, SIZE * 0.78, SIZE * 0.33, matcha, 95)
blob(bg, SIZE * 0.22, SIZE * 0.76, SIZE * 0.28, indigo_soft, 85)
img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx = SIZE // 2

# ---- 道（手前が広く、奥がすぼまる台形） ----
road_top_y = SIZE * 0.44
road_bottom_y = SIZE * 0.94
draw.polygon(
    [
        (cx - SIZE * 0.06, road_top_y),
        (cx + SIZE * 0.06, road_top_y),
        (cx + SIZE * 0.36, road_bottom_y),
        (cx - SIZE * 0.36, road_bottom_y),
    ],
    fill=(78, 72, 66, 235),
)

# ---- センターライン（破線） ----
dash = [(0.46, 0.52), (0.57, 0.67), (0.74, 0.90)]
for t0, t1 in dash:
    y0 = SIZE * t0
    y1 = SIZE * t1
    def half_w(y):
        t = (y - road_top_y) / (road_bottom_y - road_top_y)
        return SIZE * (0.010 + 0.036 * t)
    draw.polygon(
        [
            (cx - half_w(y0), y0),
            (cx + half_w(y0), y0),
            (cx + half_w(y1), y1),
            (cx - half_w(y1), y1),
        ],
        fill=cream,
    )

# ---- 標識（柱＋赤い縁の丸） ----
pole_x = SIZE * 0.735
draw.rectangle([pole_x - SIZE * 0.013, SIZE * 0.34, pole_x + SIZE * 0.013, SIZE * 0.78], fill=(120, 112, 104, 255))
sign_r = SIZE * 0.135
sign_cy = SIZE * 0.30
draw.ellipse([pole_x - sign_r, sign_cy - sign_r, pole_x + sign_r, sign_cy + sign_r], fill=cream)
draw.ellipse(
    [pole_x - sign_r, sign_cy - sign_r, pole_x + sign_r, sign_cy + sign_r],
    outline=vermillion, width=int(SIZE * 0.035),
)
# 標識の中の矢印（みちしるべ）
draw.line([(pole_x, sign_cy + sign_r * 0.42), (pole_x, sign_cy - sign_r * 0.18)], fill=indigo, width=int(SIZE * 0.026))
draw.polygon(
    [
        (pole_x, sign_cy - sign_r * 0.52),
        (pole_x - sign_r * 0.36, sign_cy - sign_r * 0.06),
        (pole_x + sign_r * 0.36, sign_cy - sign_r * 0.06),
    ],
    fill=indigo,
)

# ---- 免許証カード ----
card_w, card_h = SIZE * 0.40, SIZE * 0.25
card_x = SIZE * 0.10
card_y = SIZE * 0.50
draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=int(SIZE * 0.035), fill=indigo)
draw.rounded_rectangle(
    [card_x + SIZE * 0.018, card_y + SIZE * 0.018, card_x + card_w - SIZE * 0.018, card_y + card_h - SIZE * 0.018],
    radius=int(SIZE * 0.022), fill=cream,
)
# 顔写真部分
face_x = card_x + SIZE * 0.045
face_y = card_y + SIZE * 0.055
draw.ellipse([face_x, face_y, face_x + SIZE * 0.062, face_y + SIZE * 0.062], fill=indigo)
draw.pieslice(
    [face_x - SIZE * 0.016, face_y + SIZE * 0.05, face_x + SIZE * 0.078, face_y + SIZE * 0.15],
    start=180, end=360, fill=indigo,
)
# 記載行
line_x = card_x + SIZE * 0.145
for i, (color, w) in enumerate([(vermillion, 0.20), (gold, 0.20), (matcha, 0.13)]):
    ly = card_y + SIZE * 0.058 + i * SIZE * 0.048
    draw.rounded_rectangle([line_x, ly, line_x + SIZE * w, ly + SIZE * 0.020], radius=int(SIZE * 0.010), fill=color)

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
