#!/usr/bin/env python3
"""Generate a night-sky / star-compass app icon set for 星の羅針盤 (株価予測シミュレータ)."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(7)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

indigo_dark = (14, 16, 30, 255)
indigo = (32, 38, 68, 255)
indigo_light = (58, 68, 116, 255)
gold = (196, 158, 74, 255)
gold_soft = (224, 196, 140, 255)
teal = (47, 133, 128, 255)
white = (240, 238, 250, 255)

# ---------- night-sky background ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
base = Image.new("RGBA", (SIZE, SIZE), indigo_dark)
bg.alpha_composite(base)


def glow(draw_img, cx, cy, r, color, alpha):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*color[:3], alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(SIZE * 0.05))
    draw_img.alpha_composite(layer)


glow(bg, SIZE * 0.28, SIZE * 0.24, SIZE * 0.34, indigo_light, 130)
glow(bg, SIZE * 0.76, SIZE * 0.22, SIZE * 0.26, gold, 90)
glow(bg, SIZE * 0.7, SIZE * 0.78, SIZE * 0.32, teal, 90)
glow(bg, SIZE * 0.5, SIZE * 0.5, SIZE * 0.46, indigo_light, 45)

img.alpha_composite(bg)

# ---------- scattered stars ----------
star_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(star_layer)
for _ in range(70):
    sx = random.uniform(SIZE * 0.05, SIZE * 0.95)
    sy = random.uniform(SIZE * 0.05, SIZE * 0.95)
    sr = random.uniform(SIZE * 0.002, SIZE * 0.007)
    col = gold_soft if random.random() < 0.3 else white
    a = random.randint(120, 230)
    sd.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=(*col[:3], a))
img.alpha_composite(star_layer)

draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, SIZE // 2

# ---------- outer ring ----------
r_outer = SIZE * 0.40
draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], outline=(255, 255, 255, 220), width=int(SIZE * 0.012))

# ---------- ascending constellation line (株価予測の右肩上がりのトレンド) ----------
points = [
    (cx - SIZE * 0.26, cy + SIZE * 0.20),
    (cx - SIZE * 0.14, cy + SIZE * 0.10),
    (cx - SIZE * 0.02, cy + SIZE * 0.14),
    (cx + SIZE * 0.10, cy - SIZE * 0.04),
    (cx + SIZE * 0.22, cy - SIZE * 0.10),
    (cx + SIZE * 0.28, cy - SIZE * 0.24),
]
line_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ld = ImageDraw.Draw(line_layer)
ld.line(points, fill=(*gold[:3], 235), width=int(SIZE * 0.014), joint="curve")
img.alpha_composite(line_layer)

# ---------- star nodes on the line, growing larger toward the end ----------
for i, (px, py) in enumerate(points):
    t = i / (len(points) - 1)
    rr = SIZE * (0.014 + 0.02 * t)
    glow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    gd.ellipse([px - rr * 2.2, py - rr * 2.2, px + rr * 2.2, py + rr * 2.2], fill=(*gold[:3], 70))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(SIZE * 0.01))
    img.alpha_composite(glow_layer)
    draw.ellipse([px - rr, py - rr, px + rr, py + rr], fill=white, outline=gold, width=max(2, int(SIZE * 0.004)))

# ---------- compass needle / guiding star at the tip ----------
tip_x, tip_y = points[-1][0], points[-1][1] - SIZE * 0.05


def star4(draw_img, x, y, r, color):
    pts = []
    for i in range(8):
        ang = math.pi / 2 * (i // 2) + (0 if i % 2 == 0 else math.pi / 4)
        rr = r if i % 2 == 0 else r * 0.34
        pts.append((x + math.cos(ang - math.pi / 2) * rr, y + math.sin(ang - math.pi / 2) * rr))
    draw_img.polygon(pts, fill=color)


glow(img, tip_x, tip_y, SIZE * 0.09, gold, 110)
star4(draw, tip_x, tip_y, SIZE * 0.05, gold_soft)
star4(draw, tip_x, tip_y, SIZE * 0.024, white)

img.save("/home/user/app/yosoku/icons/icon-source.png")


def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), indigo_dark)
        inner = img.resize((size - pad * 2, size - pad * 2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), indigo_dark[:3])
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)


export(192, "/home/user/app/yosoku/icons/icon-192.png")
export(512, "/home/user/app/yosoku/icons/icon-512.png")
export(192, "/home/user/app/yosoku/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/yosoku/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/yosoku/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/yosoku/icons/favicon-32.png")
export(16, "/home/user/app/yosoku/icons/favicon-16.png")

print("icons generated")
