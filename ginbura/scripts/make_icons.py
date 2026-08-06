#!/usr/bin/env python3
"""Generate a watercolor-style clock-tower app icon set for 銀ぶら検定."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(21)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (168, 74, 58, 255),   # 煉瓦色
    (196, 149, 82, 255),  # 金
    (122, 140, 92, 255),  # 柳色
    (206, 128, 108, 255), # 淡い煉瓦色
]

base = Image.new("RGBA", (SIZE, SIZE), (243, 236, 224, 255))
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
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

blob(bg, SIZE*0.26, SIZE*0.24, SIZE*0.32, palette[2], 100)
blob(bg, SIZE*0.76, SIZE*0.26, SIZE*0.30, palette[1], 110)
blob(bg, SIZE*0.70, SIZE*0.76, SIZE*0.34, palette[0], 100)
blob(bg, SIZE*0.24, SIZE*0.74, SIZE*0.28, palette[3], 90)
img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx = SIZE // 2

brick = (168, 74, 58, 255)
gold = (196, 149, 82, 255)
cream = (243, 236, 224, 255)

# building body
body_w, body_h = SIZE*0.46, SIZE*0.34
body_top = SIZE*0.50
draw.rectangle([cx - body_w/2, body_top, cx + body_w/2, body_top + body_h], fill=brick)
draw.rectangle([cx - body_w/2, body_top, cx + body_w/2, body_top + SIZE*0.03], fill=gold)

# windows
win_w, win_h = SIZE*0.07, SIZE*0.11
for i, dx in enumerate([-0.16, 0.0, 0.16]):
    wx = cx + SIZE*dx
    wy = body_top + SIZE*0.10
    draw.rectangle([wx - win_w/2, wy, wx + win_w/2, wy + win_h], fill=cream)

# tower
tower_w = SIZE*0.11
tower_top = SIZE*0.18
draw.rectangle([cx - tower_w/2, tower_top, cx + tower_w/2, body_top], fill=brick)

# clock circle
clock_r = SIZE*0.085
clock_cy = tower_top + SIZE*0.07
draw.ellipse([cx - clock_r, clock_cy - clock_r, cx + clock_r, clock_cy + clock_r], fill=cream, outline=gold, width=int(SIZE*0.014))
# clock hands
draw.line([(cx, clock_cy), (cx, clock_cy - clock_r*0.55)], fill=brick, width=int(SIZE*0.012))
draw.line([(cx, clock_cy), (cx + clock_r*0.4, clock_cy + clock_r*0.2)], fill=brick, width=int(SIZE*0.012))

# tower roof
roof_h = SIZE*0.05
draw.polygon([(cx - tower_w/2 - SIZE*0.01, tower_top), (cx + tower_w/2 + SIZE*0.01, tower_top), (cx, tower_top - roof_h)], fill=gold)

img.save("/home/user/app/ginbura/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (243, 236, 224, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (243, 236, 224))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/ginbura/icons/icon-192.png")
export(512, "/home/user/app/ginbura/icons/icon-512.png")
export(192, "/home/user/app/ginbura/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/ginbura/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/ginbura/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/ginbura/icons/favicon-32.png")
export(16, "/home/user/app/ginbura/icons/favicon-16.png")

print("icons generated")
