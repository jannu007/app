#!/usr/bin/env python3
"""Generate a watercolor-style calendar-notebook app icon set for こよみ手帖."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(23)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (58, 74, 110, 255),    # 藍色 indigo (notebook cover)
    (200, 158, 74, 255),   # 金 gold (ribbon)
    (63, 96, 148, 255),    # 土曜の青 sat blue
    (199, 74, 58, 255),    # 日曜の赤 sun red
]

base = Image.new("RGBA", (SIZE, SIZE), (247, 243, 233, 255))  # warm ivory paper
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

blob(bg, SIZE*0.30, SIZE*0.28, SIZE*0.34, palette[0], 130)
blob(bg, SIZE*0.74, SIZE*0.26, SIZE*0.30, palette[1], 120)
blob(bg, SIZE*0.66, SIZE*0.74, SIZE*0.36, palette[2], 110)
blob(bg, SIZE*0.26, SIZE*0.72, SIZE*0.28, palette[3], 90)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[0], 45)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, int(SIZE * 0.52)

# ---------- soft ring ----------
r_outer = SIZE * 0.40
draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer],
             outline=(255, 255, 255, 220), width=int(SIZE * 0.012))

# ---------- notebook page ----------
page = (250, 247, 240, 255)
indigo = (58, 74, 110, 255)
indigo_dark = (40, 52, 80, 255)
gold = (200, 158, 74, 255)

page_w, page_h = SIZE*0.46, SIZE*0.42
px0, py0 = cx - page_w/2, cy - page_h/2 + SIZE*0.02
draw.rounded_rectangle([px0, py0, px0+page_w, py0+page_h], radius=SIZE*0.045, fill=page, outline=indigo_dark, width=int(SIZE*0.01))

# cover band (top)
band_h = page_h * 0.26
draw.rounded_rectangle([px0, py0, px0+page_w, py0+band_h], radius=SIZE*0.045, fill=indigo)
draw.rectangle([px0, py0 + band_h*0.55, px0+page_w, py0+band_h], fill=indigo)

# binding rings
ring_r = SIZE*0.018
for fx in (0.28, 0.72):
    rx = px0 + page_w*fx
    draw.rounded_rectangle([rx-ring_r, py0-ring_r*1.6, rx+ring_r, py0+ring_r*2.2], radius=ring_r, fill=gold)

# ribbon bookmark
ribbon_w = page_w * 0.09
rbx = px0 + page_w*0.66
draw.polygon([
    (rbx, py0 - SIZE*0.01),
    (rbx + ribbon_w, py0 - SIZE*0.01),
    (rbx + ribbon_w, py0 + page_h*0.5),
    (rbx + ribbon_w/2, py0 + page_h*0.42),
    (rbx, py0 + page_h*0.5),
], fill=(199, 74, 58, 255))

# date grid (below the band)
grid_top = py0 + band_h + page_h*0.10
cell = page_w * 0.12
gap = page_w * 0.025
cols = 3
rows = 2
grid_w = cols*cell + (cols-1)*gap
gx0 = px0 + (page_w-grid_w)/2
today_col, today_row = 1, 1
for r in range(rows):
    for c in range(cols):
        x = gx0 + c*(cell+gap)
        y = grid_top + r*(cell+gap)
        if c == today_col and r == today_row:
            draw.rounded_rectangle([x, y, x+cell, y+cell], radius=cell*0.28, fill=(199, 74, 58, 255))
        else:
            draw.rounded_rectangle([x, y, x+cell, y+cell], radius=cell*0.28, fill=(58, 74, 110, 60))

img.save("/home/user/app/koyomi/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (247, 243, 233, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (247, 243, 233))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/koyomi/icons/icon-192.png")
export(512, "/home/user/app/koyomi/icons/icon-512.png")
export(192, "/home/user/app/koyomi/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/koyomi/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/koyomi/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/koyomi/icons/favicon-32.png")
export(16, "/home/user/app/koyomi/icons/favicon-16.png")

print("icons generated")
