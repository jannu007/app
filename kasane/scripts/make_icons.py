#!/usr/bin/env python3
"""Generate a watercolor-style stacked-playing-cards app icon set for かさね札."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(3)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (176, 46, 46, 255),   # 紅
    (58, 74, 122, 255),   # 藍
    (190, 150, 70, 255),  # 金
    (214, 110, 104, 255), # 淡紅
]

base = Image.new("RGBA", (SIZE, SIZE), (245, 240, 228, 255))
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

blob(bg, SIZE*0.26, SIZE*0.24, SIZE*0.32, palette[1], 110)
blob(bg, SIZE*0.76, SIZE*0.28, SIZE*0.30, palette[2], 110)
blob(bg, SIZE*0.70, SIZE*0.76, SIZE*0.34, palette[0], 100)
blob(bg, SIZE*0.24, SIZE*0.74, SIZE*0.28, palette[3], 90)
img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, int(SIZE * 0.53)

def rounded_card(cx, cy, w, h, angle, fill, outline, outline_w):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([cx - w/2, cy - h/2, cx + w/2, cy + h/2], radius=w*0.12, fill=fill, outline=outline, width=outline_w)
    layer = layer.rotate(angle, center=(cx, cy), resample=Image.BICUBIC)
    img.alpha_composite(layer)

card_w, card_h = SIZE * 0.40, SIZE * 0.56
cream = (251, 247, 237, 255)
ink = (46, 38, 50, 255)

rounded_card(cx + SIZE*0.05, cy + SIZE*0.03, card_w, card_h, -10, cream, ink, int(SIZE*0.006))
rounded_card(cx - SIZE*0.05, cy - SIZE*0.01, card_w, card_h, 8, cream, ink, int(SIZE*0.006))

# 手前のカードにハートの記号
heart_col = (176, 46, 46, 255)
hx, hy = cx - SIZE*0.05, cy - SIZE*0.01
hr = SIZE * 0.075
layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ld = ImageDraw.Draw(layer)
ld.ellipse([hx - hr*1.05, hy - hr*0.55, hx - hr*0.05, hy + hr*0.45], fill=heart_col)
ld.ellipse([hx + hr*0.05, hy - hr*0.55, hx + hr*1.05, hy + hr*0.45], fill=heart_col)
ld.polygon([(hx - hr*1.0, hy + hr*0.15), (hx + hr*1.0, hy + hr*0.15), (hx, hy + hr*1.15)], fill=heart_col)
layer = layer.rotate(8, center=(hx, hy), resample=Image.BICUBIC)
img.alpha_composite(layer)

img.save("/home/user/app/kasane/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (245, 240, 228, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (245, 240, 228))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/kasane/icons/icon-192.png")
export(512, "/home/user/app/kasane/icons/icon-512.png")
export(192, "/home/user/app/kasane/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/kasane/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/kasane/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/kasane/icons/favicon-32.png")
export(16, "/home/user/app/kasane/icons/favicon-16.png")

print("icons generated")
