#!/usr/bin/env python3
"""Generate a washi watercolor-style app icon set for つみたての庭 (新NISAシミュレーター)."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(11)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (94, 140, 122, 255),   # 抹茶 matcha green (growth)
    (196, 149, 63, 255),   # gold (assets)
    (58, 82, 130, 255),    # 藍色 indigo
    (176, 58, 46, 255),    # 朱色 vermillion accent
]

base = Image.new("RGBA", (SIZE, SIZE), (247, 241, 226, 255))  # washi paper cream
bg.alpha_composite(base)

def blob(draw_img, cx, cy, r, color, alpha):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = []
    n = 14
    for i in range(n):
        ang = 2 * math.pi * i / n
        rr = r * (0.8 + 0.35 * random.random())
        x = cx + rr * math.cos(ang)
        y = cy + rr * math.sin(ang)
        pts.append((x, y))
    d.polygon(pts, fill=(*color[:3], alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(SIZE * 0.035))
    draw_img.alpha_composite(layer)

blob(bg, SIZE*0.30, SIZE*0.28, SIZE*0.34, palette[0], 150)
blob(bg, SIZE*0.74, SIZE*0.30, SIZE*0.28, palette[1], 140)
blob(bg, SIZE*0.66, SIZE*0.74, SIZE*0.34, palette[2], 120)
blob(bg, SIZE*0.26, SIZE*0.72, SIZE*0.28, palette[3], 100)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[0], 55)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)

# ---------- ink circle ring ----------
cx, cy = SIZE//2, SIZE//2
r_outer = SIZE*0.40
draw.ellipse([cx-r_outer, cy-r_outer, cx+r_outer, cy+r_outer], outline=(255,255,255,230), width=int(SIZE*0.012))

# ---------- bonsai / money-tree glyph ----------
ink = (58, 46, 40, 255)
gold = (196, 149, 63, 255)
gold_dark = (150, 108, 40, 255)
matcha = (94, 140, 122, 255)
matcha_d = (66, 104, 90, 255)
cream = (250, 244, 231, 255)

# pot (盆栽鉢)
pot_w, pot_h = SIZE*0.30, SIZE*0.14
pot_x0, pot_y0 = cx - pot_w/2, cy + SIZE*0.14
draw.polygon(
    [(pot_x0, pot_y0), (pot_x0+pot_w, pot_y0),
     (pot_x0+pot_w*0.86, pot_y0+pot_h), (pot_x0+pot_w*0.14, pot_y0+pot_h)],
    fill=gold_dark, outline=ink,
)
draw.rectangle([pot_x0-SIZE*0.01, pot_y0-SIZE*0.012, pot_x0+pot_w+SIZE*0.01, pot_y0+SIZE*0.016], fill=gold)

# trunk (幹) — tapered curve using polygon
trunk_top = (cx - SIZE*0.01, cy - SIZE*0.20)
draw.line([(cx, pot_y0), (cx-SIZE*0.02, cy+SIZE*0.02), (cx+SIZE*0.015, cy-SIZE*0.08), trunk_top],
          fill=ink, width=int(SIZE*0.028), joint="curve")
draw.line([(cx-SIZE*0.03, cy-SIZE*0.02), (cx-SIZE*0.10, cy-SIZE*0.14)], fill=ink, width=int(SIZE*0.016))
draw.line([(cx+SIZE*0.02, cy-SIZE*0.10), (cx+SIZE*0.11, cy-SIZE*0.20)], fill=ink, width=int(SIZE*0.016))

# foliage clusters (葉 — matcha green, with gold "coin fruit" accents)
def foliage(fx, fy, r, color):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for _ in range(9):
        ang = random.random() * math.pi * 2
        rr = r * (0.35 + 0.65 * random.random())
        px = fx + math.cos(ang) * rr
        py = fy + math.sin(ang) * rr
        rad = r * (0.42 + 0.3 * random.random())
        ld.ellipse([px-rad, py-rad, px+rad, py+rad], fill=color)
    draw_img_layer = layer.filter(ImageFilter.GaussianBlur(SIZE*0.004))
    img.alpha_composite(draw_img_layer)

foliage(cx, cy - SIZE*0.30, SIZE*0.14, matcha)
foliage(cx - SIZE*0.14, cy - SIZE*0.20, SIZE*0.115, matcha)
foliage(cx + SIZE*0.15, cy - SIZE*0.24, SIZE*0.12, matcha_d)

# gold coin "fruits" nestled in the foliage — symbolising growing assets
coin_positions = [
    (cx - SIZE*0.05, cy - SIZE*0.33, SIZE*0.028),
    (cx + SIZE*0.09, cy - SIZE*0.29, SIZE*0.024),
    (cx - SIZE*0.16, cy - SIZE*0.17, SIZE*0.022),
    (cx + SIZE*0.02, cy - SIZE*0.22, SIZE*0.026),
    (cx + SIZE*0.17, cy - SIZE*0.22, SIZE*0.02),
]
for (px, py, r) in coin_positions:
    draw.ellipse([px-r, py-r, px+r, py+r], fill=gold, outline=gold_dark, width=max(2, int(SIZE*0.004)))
    draw.line([(px-r*0.45, py), (px+r*0.45, py)], fill=gold_dark, width=max(2, int(SIZE*0.003)))
    draw.line([(px, py-r*0.45), (px, py+r*0.45)], fill=gold_dark, width=max(2, int(SIZE*0.003)))

img.save("/home/user/app/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (247, 241, 226, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (247, 241, 226))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/icons/icon-192.png")
export(512, "/home/user/app/icons/icon-512.png")
export(192, "/home/user/app/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/icons/favicon-32.png")
export(16, "/home/user/app/icons/favicon-16.png")

print("icons generated")
