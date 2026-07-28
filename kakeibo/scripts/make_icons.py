#!/usr/bin/env python3
"""Generate a Kyoto watercolor-style app icon set for 京の家計帖."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(7)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (176, 58, 46, 255),    # 朱色 vermillion (torii red)
    (58, 82, 130, 255),    # 藍色 indigo
    (94, 140, 122, 255),   # 抹茶 matcha green
    (214, 168, 88, 255),   # gold
]

base = Image.new("RGBA", (SIZE, SIZE), (250, 244, 231, 255))  # washi paper cream
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

blob(bg, SIZE*0.32, SIZE*0.30, SIZE*0.34, palette[1], 150)
blob(bg, SIZE*0.72, SIZE*0.28, SIZE*0.30, palette[0], 140)
blob(bg, SIZE*0.62, SIZE*0.72, SIZE*0.36, palette[2], 140)
blob(bg, SIZE*0.28, SIZE*0.70, SIZE*0.28, palette[3], 120)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[1], 60)

img.alpha_composite(bg)

# soft vignette circle mask edge (rounded square handled by manifest 'maskable')
draw = ImageDraw.Draw(img)

# ---------- ink circle ring (Kyoto crest style) ----------
ring_c = (58, 42, 38, 255)
cx, cy = SIZE//2, SIZE//2
r_outer = SIZE*0.40
draw.ellipse([cx-r_outer, cy-r_outer, cx+r_outer, cy+r_outer], outline=(255,255,255,230), width=int(SIZE*0.012))

# ---------- coin purse / wallet glyph ----------
gold = (196, 149, 63, 255)
gold_dark = (150, 108, 40, 255)
cream = (250, 244, 231, 255)

pw, ph = SIZE*0.40, SIZE*0.30
px0, py0 = cx - pw/2, cy - ph/2 + SIZE*0.03

# purse body (rounded)
draw.rounded_rectangle([px0, py0, px0+pw, py0+ph], radius=SIZE*0.06, fill=cream, outline=gold_dark, width=int(SIZE*0.01))
# purse flap
flap_h = ph*0.45
draw.rounded_rectangle([px0, py0-flap_h*0.55, px0+pw, py0+flap_h*0.55], radius=SIZE*0.05, fill=gold, outline=gold_dark, width=int(SIZE*0.01))
# clasp
clasp_r = SIZE*0.035
draw.ellipse([cx-clasp_r, py0-clasp_r*0.4, cx+clasp_r, py0+clasp_r*1.6], fill=gold_dark)

# coin (yen) accent bottom right of purse
coin_r = SIZE*0.09
coin_cx, coin_cy = px0+pw*0.92, py0+ph*1.05
draw.ellipse([coin_cx-coin_r, coin_cy-coin_r, coin_cx+coin_r, coin_cy+coin_r], fill=gold, outline=gold_dark, width=int(SIZE*0.008))

# ---------- sakura petals (5-petal flower) motion accent ----------
def petal(draw_img, cx, cy, size, angle, color):
    layer = Image.new("RGBA", (SIZE, SIZE), (0,0,0,0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([cx-size, cy-size*0.6, cx+size, cy+size*0.6], fill=color)
    layer = layer.rotate(angle, center=(cx, cy), resample=Image.BICUBIC)
    draw_img.alpha_composite(layer)

sakura_pink = (232, 168, 176, 255)
sakura_pink_d = (214, 132, 148, 255)

def sakura_flower(draw_img, fx, fy, scale):
    for i in range(5):
        ang = i * 72
        rad = math.radians(ang)
        px = fx + math.cos(rad) * scale * 0.55
        py = fy + math.sin(rad) * scale * 0.55
        petal(draw_img, px, py, scale*0.55, ang, sakura_pink)
    r = scale*0.22
    draw_img_d = ImageDraw.Draw(draw_img)
    draw_img_d.ellipse([fx-r, fy-r, fx+r, fy+r], fill=sakura_pink_d)

sakura_flower(img, SIZE*0.78, SIZE*0.66, SIZE*0.10)
sakura_flower(img, SIZE*0.22, SIZE*0.28, SIZE*0.075)

img.save("/home/user/app/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        # add 10% safe padding on solid washi background
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (250, 244, 231, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (250, 244, 231))
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
