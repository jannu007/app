#!/usr/bin/env python3
"""花琵琶文庫のアイコン（黒漆に金蒔絵の琵琶と桜）を生成する。Pillow使用。"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(27)
S = 1024
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")


def gold_background():
    bg = Image.new("RGBA", (S, S), (11, 9, 7, 255))
    px = bg.load()
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - S * 0.62, y - S * 0.38) / S
            t = min(1, d * 1.3)
            r = int(36 * (1 - t) + 6 * t)
            g = int(29 * (1 - t) + 5 * t)
            b = int(19 * (1 - t) + 4 * t)
            n = random.randint(-2, 2)
            px[x, y] = (max(0, r + n), max(0, g + n), max(0, b + n), 255)
    d = ImageDraw.Draw(bg)
    # 切金：金箔の小さな四角
    for _ in range(55):
        x, y = random.random() * S, random.random() * S
        k = S * (0.003 + random.random() * 0.005)
        a = random.randint(60, 190)
        d.rectangle([x, y, x + k, y + k], fill=(222, 190, 115, a))
    # 霞
    haze = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(haze)
    hd.rounded_rectangle([-40, S * 0.7, S * 0.62, S * 0.75], radius=30, fill=(201, 165, 90, 70))
    hd.rounded_rectangle([S * 0.45, S * 0.82, S + 40, S * 0.86], radius=24, fill=(201, 165, 90, 60))
    bg.alpha_composite(haze.filter(ImageFilter.GaussianBlur(6)))
    return bg


def petal_poly(cx, cy, r, ang):
    pts = []
    for i in range(24):
        t = i / 23
        # 桜の花びら：先が割れたしずく形
        w = math.sin(math.pi * t) * 0.42 * r
        y = -t * r
        pts.append((w, y))
    pts += [(0, -r * 0.86)]
    pts += [(-x, y) for (x, y) in reversed(pts[:-1])]
    out = []
    ca, sa = math.cos(ang), math.sin(ang)
    for x, y in pts:
        out.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return out


def flower(img, cx, cy, r, rot=0.0):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for k in range(5):
        a = rot + k * 2 * math.pi / 5
        d.polygon(petal_poly(cx, cy, r, a), fill=(226, 196, 122, 255), outline=(122, 92, 34, 255))
    d.ellipse([cx - r * 0.16, cy - r * 0.16, cx + r * 0.16, cy + r * 0.16], fill=(26, 19, 11, 255))
    for k in range(5):
        a = rot + (k + 0.5) * 2 * math.pi / 5
        ex, ey = cx + math.sin(a) * r * 0.34, cy - math.cos(a) * r * 0.34
        d.line([(cx, cy), (ex, ey)], fill=(90, 66, 24, 255), width=max(2, int(r * 0.03)))
        d.ellipse([ex - r * 0.05, ey - r * 0.05, ex + r * 0.05, ey + r * 0.05], fill=(246, 227, 166, 255))
    img.alpha_composite(layer)


def biwa(img):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = S * 0.5, S * 0.56
    # 胴（洋梨形）
    body = []
    for i in range(200):
        t = 2 * math.pi * i / 200
        x = math.sin(t)
        y = -math.cos(t)
        w = 0.215 * S * (1 - 0.45 * max(0, -y)) ** 1.3
        h = 0.27 * S
        body.append((cx + x * w, cy + y * h + (0.06 * S if y > 0 else 0) * 0))
    d.polygon(body, fill=(201, 165, 90, 255), outline=(243, 223, 163, 255))
    # 撥面の帯
    band = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.polygon([(cx - S * 0.3, cy + S * 0.03), (cx + S * 0.3, cy + S * 0.09), (cx + S * 0.3, cy + S * 0.17), (cx - S * 0.3, cy + S * 0.11)], fill=(12, 10, 8, 255))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(body, fill=255)
    layer.paste(band, (0, 0), Image.composite(band.split()[3], Image.new("L", (S, S), 0), mask))
    # 首と海老尾
    d.polygon([(cx - S * 0.022, cy - S * 0.25), (cx - S * 0.016, cy - S * 0.42), (cx + S * 0.016, cy - S * 0.42), (cx + S * 0.022, cy - S * 0.25)], fill=(150, 116, 52, 255))
    d.polygon([(cx - S * 0.016, cy - S * 0.42), (cx + S * 0.016, cy - S * 0.42), (cx + S * 0.05, cy - S * 0.52), (cx + S * 0.016, cy - S * 0.53)], fill=(120, 92, 40, 255))
    for k, yy in enumerate([0.445, 0.47, 0.495]):
        side = -1 if k % 2 == 0 else 1
        y = cy - S * yy
        d.line([(cx + S * 0.02, y), (cx + S * 0.02 + side * S * 0.06, y + S * 0.006)], fill=(240, 217, 149, 255), width=int(S * 0.012))
    # 覆手
    d.rounded_rectangle([cx - S * 0.1, cy + S * 0.21, cx + S * 0.1, cy + S * 0.235], radius=6, fill=(12, 10, 8, 255), outline=(201, 165, 90, 255), width=3)
    # 弦
    for k in range(4):
        o = (k - 1.5)
        d.line([(cx + o * S * 0.006, cy - S * 0.42), (cx + o * S * 0.026, cy + S * 0.215)], fill=(40, 30, 18, 255), width=4)
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - S * 0.15, cy - S * 0.2, cx - S * 0.01, cy + S * 0.05], fill=(255, 244, 205, 70))
    hl = hl.filter(ImageFilter.GaussianBlur(20))
    layer.alpha_composite(Image.composite(hl, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask))
    layer = layer.rotate(28, center=(cx, cy), resample=Image.BICUBIC)
    shadow = layer.split()[3].filter(ImageFilter.GaussianBlur(18))
    sh = Image.new("RGBA", (S, S), (201, 165, 90, 0))
    sh.putalpha(shadow.point(lambda v: int(v * 0.22)))
    img.alpha_composite(sh, (10, 18))
    img.alpha_composite(layer)


img = gold_background()
# 枝
br = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(br)
bd.line([(S * 1.02, S * 0.06), (S * 0.78, S * 0.15), (S * 0.6, S * 0.12), (S * 0.46, S * 0.17)], fill=(176, 140, 66, 255), width=int(S * 0.028), joint="curve")
bd.line([(S * 0.78, S * 0.15), (S * 0.86, S * 0.3)], fill=(176, 140, 66, 255), width=int(S * 0.018), joint="curve")
img.alpha_composite(br)
biwa(img)
for (x, y, r, a) in [(0.6, 0.1, 0.085, 0.2), (0.78, 0.16, 0.07, 0.9), (0.9, 0.08, 0.06, 0.4), (0.47, 0.18, 0.055, 1.1), (0.86, 0.3, 0.06, 0.6), (0.2, 0.78, 0.05, 0.3)]:
    flower(img, S * x, S * y, S * r, a)

ImageDraw.Draw(img).rounded_rectangle([18, 18, S - 18, S - 18], radius=int(S * 0.2), outline=(201, 165, 90, 120), width=4)
img.save(os.path.join(OUT, "icon-source.png"))


def export(size, name, maskable=False):
    if maskable:
        pad = int(size * 0.1)
        canvas = Image.new("RGBA", (size, size), (11, 9, 7, 255))
        inner = img.resize((size - 2 * pad, size - 2 * pad), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        out = canvas
    else:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=255)
        rounded = img.copy()
        rounded.putalpha(mask)
        out = rounded.resize((size, size), Image.LANCZOS)
    out.save(os.path.join(OUT, name))


export(512, "icon-512.png")
export(192, "icon-192.png")
export(512, "icon-maskable-512.png", True)
export(192, "icon-maskable-192.png", True)
img.convert("RGB").resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "apple-touch-icon.png"))
export(32, "favicon-32.png")
export(16, "favicon-16.png")
print("ok")
