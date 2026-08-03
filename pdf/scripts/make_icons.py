#!/usr/bin/env python3
"""Generate a washi/indigo bookmark-themed app icon set for 栞PDF."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (58, 82, 130, 255),    # 藍色 indigo
    (214, 168, 88, 255),   # gold
    (94, 140, 122, 255),   # 抹茶 matcha (accent only)
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

blob(bg, SIZE*0.28, SIZE*0.26, SIZE*0.34, palette[0], 150)
blob(bg, SIZE*0.74, SIZE*0.30, SIZE*0.28, palette[1], 120)
blob(bg, SIZE*0.66, SIZE*0.74, SIZE*0.34, palette[0], 110)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[0], 55)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, SIZE // 2

# ---------- 墨色の輪（京都紋章風） ----------
r_outer = SIZE * 0.40
draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer],
             outline=(255, 255, 255, 220), width=int(SIZE * 0.012))

# ---------- 重なる書類（PDFページ） ----------
cream = (250, 244, 231, 255)
paper_edge = (150, 108, 40, 255)

def page_rect(offset_x, offset_y, w, h, rotation=0):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    x0, y0 = cx - w / 2 + offset_x, cy - h / 2 + offset_y
    ld.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=SIZE * 0.03,
                          fill=cream, outline=paper_edge, width=int(SIZE * 0.007))
    if rotation:
        layer = layer.rotate(rotation, center=(cx + offset_x + w / 2 * 0, cy + offset_y), resample=Image.BICUBIC)
    draw_img_d = layer
    return layer

pw, ph = SIZE * 0.34, SIZE * 0.42
page_back = page_rect(SIZE * 0.05, SIZE * 0.07, pw, ph, rotation=-8)
img.alpha_composite(page_back)
page_front = page_rect(-SIZE * 0.03, -SIZE * 0.02, pw, ph, rotation=4)
img.alpha_composite(page_front)

# 表紙ページの折れ線（本文の目安線）
front_x0 = cx - pw / 2 - SIZE * 0.03
front_y0 = cy - ph / 2 - SIZE * 0.02
draw2 = ImageDraw.Draw(img)
line_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ld2 = ImageDraw.Draw(line_layer)
for i in range(4):
    ly = front_y0 + ph * (0.28 + i * 0.14)
    ld2.line([(front_x0 + pw * 0.16, ly), (front_x0 + pw * 0.84, ly)],
              fill=(150, 108, 40, 160), width=int(SIZE * 0.008))
line_layer = line_layer.rotate(4, center=(cx, cy), resample=Image.BICUBIC)
img.alpha_composite(line_layer)

# ---------- 栞（しおり）リボン ----------
indigo = (58, 82, 130, 255)
indigo_dark = (40, 58, 96, 255)
gold = (214, 168, 88, 255)

ribbon_w = SIZE * 0.13
ribbon_top_y = cy - ph * 0.62
ribbon_bottom_y = cy + ph * 0.58
ribbon_x = cx + pw * 0.16

ribbon_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
rd = ImageDraw.Draw(ribbon_layer)
notch = ribbon_w * 0.55
pts = [
    (ribbon_x - ribbon_w / 2, ribbon_top_y),
    (ribbon_x + ribbon_w / 2, ribbon_top_y),
    (ribbon_x + ribbon_w / 2, ribbon_bottom_y),
    (ribbon_x, ribbon_bottom_y - notch),
    (ribbon_x - ribbon_w / 2, ribbon_bottom_y),
]
rd.polygon(pts, fill=indigo, outline=indigo_dark)
rd.rectangle([ribbon_x - ribbon_w / 2, ribbon_top_y, ribbon_x + ribbon_w / 2, ribbon_top_y + ribbon_w * 0.22],
             fill=gold)
ribbon_layer = ribbon_layer.rotate(-3, center=(ribbon_x, ribbon_top_y), resample=Image.BICUBIC)
img.alpha_composite(ribbon_layer)

img.save("/home/user/app/pdf/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (250, 244, 231, 255))
        inner = img.resize((size - pad * 2, size - pad * 2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (250, 244, 231))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/pdf/icons/icon-192.png")
export(512, "/home/user/app/pdf/icons/icon-512.png")
export(192, "/home/user/app/pdf/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/pdf/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/pdf/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/pdf/icons/favicon-32.png")
export(16, "/home/user/app/pdf/icons/favicon-16.png")

print("icons generated")
