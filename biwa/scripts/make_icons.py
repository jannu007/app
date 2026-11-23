#!/usr/bin/env python3
"""花琵琶文庫のアイコン（金地に琵琶と桜）を生成する。Pillow使用。"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(27)
S = 1024
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")


def gold_background():
    bg = Image.new("RGBA", (S, S), (233, 205, 130, 255))
    px = bg.load()
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - S * 0.32, y - S * 0.28) / S
            t = min(1, d * 1.15)
            r = int(246 * (1 - t) + 210 * t)
            g = int(230 * (1 - t) + 170 * t)
            b = int(173 * (1 - t) + 92 * t)
            n = random.randint(-6, 6)
            px[x, y] = (r + n, g + n, b + n, 255)
    d = ImageDraw.Draw(bg)
    for v in (S // 3, 2 * S // 3):
        d.line([(0, v), (S, v)], fill=(196, 152, 76, 90), width=3)
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
        d.polygon(petal_poly(cx, cy, r, a), fill=(251, 214, 223, 255), outline=(222, 140, 160, 255))
    d.ellipse([cx - r * 0.16, cy - r * 0.16, cx + r * 0.16, cy + r * 0.16], fill=(247, 225, 150, 255))
    for k in range(5):
        a = rot + (k + 0.5) * 2 * math.pi / 5
        ex, ey = cx + math.sin(a) * r * 0.34, cy - math.cos(a) * r * 0.34
        d.line([(cx, cy), (ex, ey)], fill=(194, 70, 90, 255), width=max(2, int(r * 0.03)))
        d.ellipse([ex - r * 0.05, ey - r * 0.05, ex + r * 0.05, ey + r * 0.05], fill=(194, 70, 90, 255))
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
    d.polygon(body, fill=(141, 90, 43, 255), outline=(59, 36, 18, 255))
    # 撥面の帯
    band = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.polygon([(cx - S * 0.3, cy + S * 0.03), (cx + S * 0.3, cy + S * 0.09), (cx + S * 0.3, cy + S * 0.17), (cx - S * 0.3, cy + S * 0.11)], fill=(35, 28, 25, 255))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(body, fill=255)
    layer.paste(band, (0, 0), Image.composite(band.split()[3], Image.new("L", (S, S), 0), mask))
    # 首と海老尾
    d.polygon([(cx - S * 0.022, cy - S * 0.25), (cx - S * 0.016, cy - S * 0.42), (cx + S * 0.016, cy - S * 0.42), (cx + S * 0.022, cy - S * 0.25)], fill=(107, 68, 34, 255))
    d.polygon([(cx - S * 0.016, cy - S * 0.42), (cx + S * 0.016, cy - S * 0.42), (cx + S * 0.05, cy - S * 0.52), (cx + S * 0.016, cy - S * 0.53)], fill=(78, 48, 26, 255))
    for k, yy in enumerate([0.445, 0.47, 0.495]):
        side = -1 if k % 2 == 0 else 1
        y = cy - S * yy
        d.line([(cx + S * 0.02, y), (cx + S * 0.02 + side * S * 0.06, y + S * 0.006)], fill=(43, 26, 14, 255), width=int(S * 0.012))
    # 覆手
    d.rounded_rectangle([cx - S * 0.1, cy + S * 0.21, cx + S * 0.1, cy + S * 0.235], radius=6, fill=(43, 26, 14, 255))
    # 弦
    for k in range(4):
        o = (k - 1.5)
        d.line([(cx + o * S * 0.006, cy - S * 0.42), (cx + o * S * 0.026, cy + S * 0.215)], fill=(246, 232, 196, 255), width=4)
    layer = layer.rotate(28, center=(cx, cy), resample=Image.BICUBIC)
    shadow = layer.split()[3].filter(ImageFilter.GaussianBlur(18))
    sh = Image.new("RGBA", (S, S), (70, 40, 10, 0))
    sh.putalpha(shadow.point(lambda v: int(v * 0.35)))
    img.alpha_composite(sh, (10, 18))
    img.alpha_composite(layer)


img = gold_background()
# 枝
br = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(br)
bd.line([(S * 1.02, S * 0.06), (S * 0.78, S * 0.15), (S * 0.6, S * 0.12), (S * 0.46, S * 0.17)], fill=(74, 50, 35, 255), width=int(S * 0.028), joint="curve")
bd.line([(S * 0.78, S * 0.15), (S * 0.86, S * 0.3)], fill=(74, 50, 35, 255), width=int(S * 0.018), joint="curve")
img.alpha_composite(br)
biwa(img)
for (x, y, r, a) in [(0.6, 0.1, 0.085, 0.2), (0.78, 0.16, 0.07, 0.9), (0.9, 0.08, 0.06, 0.4), (0.47, 0.18, 0.055, 1.1), (0.86, 0.3, 0.06, 0.6), (0.2, 0.78, 0.05, 0.3)]:
    flower(img, S * x, S * y, S * r, a)

img.save(os.path.join(OUT, "icon-source.png"))


def export(size, name, maskable=False):
    if maskable:
        pad = int(size * 0.1)
        canvas = Image.new("RGBA", (size, size), (233, 205, 130, 255))
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
