#!/usr/bin/env python3
"""Generate a watercolor-style app icon set for そろばん帳 (abacus/ledger motif)."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(11)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (58, 82, 130, 255),    # 藍色 indigo
    (196, 149, 63, 255),   # 金 gold
    (94, 140, 122, 255),   # 抹茶 matcha green
    (176, 58, 46, 255),    # 朱色 vermillion accent
]

base = Image.new("RGBA", (SIZE, SIZE), (247, 241, 228, 255))  # washi paper cream
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
blob(bg, SIZE*0.74, SIZE*0.26, SIZE*0.28, palette[1], 130)
blob(bg, SIZE*0.66, SIZE*0.74, SIZE*0.34, palette[2], 130)
blob(bg, SIZE*0.26, SIZE*0.72, SIZE*0.26, palette[3], 110)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[0], 55)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)

# ---------- ink ring ----------
cx, cy = SIZE//2, SIZE//2
r_outer = SIZE*0.40
draw.ellipse([cx-r_outer, cy-r_outer, cx+r_outer, cy+r_outer], outline=(255,255,255,225), width=int(SIZE*0.012))

# ---------- abacus (soroban) glyph ----------
indigo = (58, 82, 130, 255)
indigo_dark = (38, 56, 92, 255)
gold = (196, 149, 63, 255)
vermillion = (176, 58, 46, 255)
cream = (250, 244, 231, 255)

fw, fh = SIZE*0.44, SIZE*0.32
fx0, fy0 = cx - fw/2, cy - fh/2

# frame
frame_w = int(SIZE * 0.02)
draw.rounded_rectangle([fx0, fy0, fx0+fw, fy0+fh], radius=SIZE*0.02, fill=cream, outline=indigo_dark, width=frame_w)

# center divider bar (dividing beam)
bar_y = fy0 + fh*0.42
draw.rectangle([fx0+SIZE*0.01, bar_y-SIZE*0.006, fx0+fw-SIZE*0.01, bar_y+SIZE*0.006], fill=indigo_dark)

# vertical rods
n_rods = 5
rod_color = (*indigo_dark[:3], 140)
for i in range(n_rods):
    rx = fx0 + fw * (i + 0.5) / n_rods
    draw.line([rx, fy0+SIZE*0.012, rx, fy0+fh-SIZE*0.012], fill=rod_color, width=int(SIZE*0.006))

# beads: 1 bead above bar (gold), 2 below (alternating vermillion/gold)
bead_r = SIZE * 0.032
for i in range(n_rods):
    rx = fx0 + fw * (i + 0.5) / n_rods
    # upper single bead, offset per column for a "counted" look
    upper_y = fy0 + fh*0.18 + (SIZE*0.02 if i % 2 == 0 else 0)
    draw.ellipse([rx-bead_r, upper_y-bead_r, rx+bead_r, upper_y+bead_r], fill=gold, outline=indigo_dark, width=int(SIZE*0.006))
    # lower beads
    for j in range(2):
        ly = fy0 + fh*0.66 + j*bead_r*1.9 + (SIZE*0.015 if (i+j) % 2 == 0 else 0)
        color = vermillion if (i + j) % 3 == 0 else gold
        draw.ellipse([rx-bead_r, ly-bead_r, rx+bead_r, ly+bead_r], fill=color, outline=indigo_dark, width=int(SIZE*0.005))

img.save("/home/user/app/soroban/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (247, 241, 228, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (247, 241, 228))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/soroban/icons/icon-192.png")
export(512, "/home/user/app/soroban/icons/icon-512.png")
export(192, "/home/user/app/soroban/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/soroban/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/soroban/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/soroban/icons/favicon-32.png")
export(16, "/home/user/app/soroban/icons/favicon-16.png")

print("icons generated")
