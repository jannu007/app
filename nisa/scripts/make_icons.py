#!/usr/bin/env python3
"""Generate a washi watercolor-style app icon set for つみたての桜 (新NISAシミュレーター)."""
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
    (232, 168, 176, 255),  # 桜色 sakura pink
    (58, 82, 130, 255),    # 藍色 indigo
    (196, 149, 63, 255),   # gold (assets)
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

blob(bg, SIZE*0.30, SIZE*0.28, SIZE*0.34, palette[1], 150)
blob(bg, SIZE*0.74, SIZE*0.30, SIZE*0.28, palette[3], 140)
blob(bg, SIZE*0.66, SIZE*0.74, SIZE*0.34, palette[2], 120)
blob(bg, SIZE*0.26, SIZE*0.72, SIZE*0.28, palette[0], 100)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[1], 55)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)

# ---------- ink circle ring ----------
cx, cy = SIZE//2, SIZE//2
r_outer = SIZE*0.40
draw.ellipse([cx-r_outer, cy-r_outer, cx+r_outer, cy+r_outer], outline=(255,255,255,230), width=int(SIZE*0.012))

# ---------- 地面から生える桜の木 ----------
ink = (58, 46, 40, 255)
gold = (196, 149, 63, 255)
gold_dark = (150, 108, 40, 255)
sakura = (232, 168, 176, 255)
sakura_deep = (214, 132, 148, 255)
grass = (138, 171, 114, 255)
grass_dark = (114, 143, 92, 255)

ground_y = cy + SIZE*0.20

# 地面（芝）
draw.polygon(
    [(0, ground_y+SIZE*0.01), (SIZE, ground_y+SIZE*0.01), (SIZE, SIZE), (0, SIZE)],
    fill=grass,
)
draw.polygon(
    [(0, ground_y+SIZE*0.03), (SIZE, ground_y+SIZE*0.03), (SIZE, SIZE), (0, SIZE)],
    fill=grass_dark,
)
# 幹まわりの影
shadow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow_layer)
sd.ellipse([cx-SIZE*0.16, ground_y-SIZE*0.015, cx+SIZE*0.16, ground_y+SIZE*0.03], fill=(58, 46, 40, 60))
shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(SIZE*0.012))
img.alpha_composite(shadow_layer)

# 幹 (幹) — tapered curve using polygon
trunk_top = (cx - SIZE*0.01, cy - SIZE*0.20)
draw.line([(cx, ground_y), (cx-SIZE*0.02, cy+SIZE*0.02), (cx+SIZE*0.015, cy-SIZE*0.08), trunk_top],
          fill=ink, width=int(SIZE*0.028), joint="curve")
draw.line([(cx-SIZE*0.03, cy-SIZE*0.02), (cx-SIZE*0.10, cy-SIZE*0.14)], fill=ink, width=int(SIZE*0.016))
draw.line([(cx+SIZE*0.02, cy-SIZE*0.10), (cx+SIZE*0.11, cy-SIZE*0.20)], fill=ink, width=int(SIZE*0.016))

# 幹の根元の小さな草
for i in range(-4, 5):
    gx = cx + i * SIZE*0.028 + (SIZE*0.006 if i % 2 == 0 else -SIZE*0.006)
    gy0 = ground_y + SIZE*0.006
    gy1 = gy0 - SIZE*0.028
    draw.line([(gx, gy0), (gx + (SIZE*0.006 if i % 2 == 0 else -SIZE*0.006), gy1)], fill=grass_dark, width=max(2, int(SIZE*0.005)))

# 桜の花房（葉 — 桜色、金の実を少し添える）
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

foliage(cx, cy - SIZE*0.30, SIZE*0.14, sakura)
foliage(cx - SIZE*0.14, cy - SIZE*0.20, SIZE*0.115, sakura)
foliage(cx + SIZE*0.15, cy - SIZE*0.24, SIZE*0.12, sakura_deep)

# 金の実 — 資産の成長を象徴する控えめなアクセント
coin_positions = [
    (cx - SIZE*0.05, cy - SIZE*0.33, SIZE*0.024),
    (cx + SIZE*0.09, cy - SIZE*0.29, SIZE*0.02),
    (cx + SIZE*0.17, cy - SIZE*0.22, SIZE*0.018),
]
for (px, py, r) in coin_positions:
    draw.ellipse([px-r, py-r, px+r, py+r], fill=gold, outline=gold_dark, width=max(2, int(SIZE*0.003)))

# 舞い散る花びら
def petal(draw_img, px, py, size, angle, color):
    layer = Image.new("RGBA", (SIZE, SIZE), (0,0,0,0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([px-size, py-size*0.6, px+size, py+size*0.6], fill=color)
    layer = layer.rotate(angle, center=(px, py), resample=Image.BICUBIC)
    draw_img.alpha_composite(layer)

petal(img, cx+SIZE*0.30, cy-SIZE*0.02, SIZE*0.02, 30, sakura)
petal(img, cx-SIZE*0.24, cy+SIZE*0.10, SIZE*0.018, -20, sakura_deep)
petal(img, cx+SIZE*0.20, cy+SIZE*0.16, SIZE*0.016, 60, sakura)

img.save("/home/user/app/nisa/icons/icon-source.png")

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

export(192, "/home/user/app/nisa/icons/icon-192.png")
export(512, "/home/user/app/nisa/icons/icon-512.png")
export(192, "/home/user/app/nisa/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/nisa/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/nisa/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/nisa/icons/favicon-32.png")
export(16, "/home/user/app/nisa/icons/favicon-16.png")

print("icons generated")
