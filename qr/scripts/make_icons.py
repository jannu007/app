#!/usr/bin/env python3
"""Generate a sumi-ink/vermillion hanko-seal themed app icon set for QR早見帖."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(7)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (58, 46, 40, 255),     # 墨色 sumi ink
    (176, 58, 46, 255),    # 朱色 vermillion (hanko)
    (196, 149, 63, 255),   # gold (accent only)
]

base = Image.new("RGBA", (SIZE, SIZE), (250, 244, 231, 255))  # washi paper cream
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


blob(bg, SIZE * 0.26, SIZE * 0.24, SIZE * 0.32, palette[1], 110)
blob(bg, SIZE * 0.76, SIZE * 0.28, SIZE * 0.26, palette[2], 110)
blob(bg, SIZE * 0.7, SIZE * 0.76, SIZE * 0.32, palette[0], 90)
blob(bg, SIZE * 0.5, SIZE * 0.5, SIZE * 0.46, palette[0], 40)

img.alpha_composite(bg)

cx, cy = SIZE // 2, SIZE // 2
draw = ImageDraw.Draw(img)

# ---------- 白い角丸パネル（QRコードの台紙） ----------
panel_r = SIZE * 0.30
panel = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
pd = ImageDraw.Draw(panel)
pd.rounded_rectangle(
    [cx - panel_r, cy - panel_r, cx + panel_r, cy + panel_r],
    radius=SIZE * 0.06,
    fill=(250, 244, 231, 255),
    outline=(58, 46, 40, 255),
    width=int(SIZE * 0.01),
)
img.alpha_composite(panel)

# ---------- QRコード風の墨色モジュール ----------
ink = (58, 46, 40, 255)
grid_n = 7
cell = (panel_r * 2 * 0.72) / grid_n
gx0 = cx - (cell * grid_n) / 2
gy0 = cy - (cell * grid_n) / 2


def finder(ox, oy):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    s = cell * 3
    ld.rectangle([ox, oy, ox + s, oy + s], fill=ink)
    ld.rectangle(
        [ox + cell * 0.55, oy + cell * 0.55, ox + s - cell * 0.55, oy + s - cell * 0.55],
        fill=(250, 244, 231, 255),
    )
    ld.rectangle(
        [ox + cell * 1.05, oy + cell * 1.05, ox + s - cell * 1.05, oy + s - cell * 1.05],
        fill=ink,
    )
    img.alpha_composite(layer)


finder(gx0, gy0)
finder(gx0 + cell * (grid_n - 3), gy0)
finder(gx0, gy0 + cell * (grid_n - 3))

random_cells = [
    (3, 0), (4, 0), (5, 1), (3, 2), (6, 3), (4, 3), (5, 4),
    (3, 4), (3, 5), (4, 5), (5, 5), (3, 6), (5, 6),
]
rd_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
rld = ImageDraw.Draw(rd_layer)
for (gxi, gyi) in random_cells:
    x0 = gx0 + gxi * cell
    y0 = gy0 + gyi * cell
    rld.rectangle([x0, y0, x0 + cell * 0.92, y0 + cell * 0.92], fill=ink)
img.alpha_composite(rd_layer)

# ---------- 朱色の判子（丸印）を右下に重ねる ----------
seal_r = SIZE * 0.15
seal_cx = cx + panel_r * 0.92
seal_cy = cy + panel_r * 0.92
seal_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(seal_layer)
sd.ellipse(
    [seal_cx - seal_r, seal_cy - seal_r, seal_cx + seal_r, seal_cy + seal_r],
    fill=(176, 58, 46, 235),
    outline=(140, 40, 30, 255),
    width=int(SIZE * 0.008),
)
sd.ellipse(
    [seal_cx - seal_r * 0.68, seal_cy - seal_r * 0.68, seal_cx + seal_r * 0.68, seal_cy + seal_r * 0.68],
    outline=(250, 244, 231, 220),
    width=int(SIZE * 0.006),
)
seal_layer = seal_layer.filter(ImageFilter.GaussianBlur(SIZE * 0.001))
img.alpha_composite(seal_layer)

img.save("/home/user/app/qr/icons/icon-source.png")


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


export(192, "/home/user/app/qr/icons/icon-192.png")
export(512, "/home/user/app/qr/icons/icon-512.png")
export(192, "/home/user/app/qr/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/qr/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/qr/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/qr/icons/favicon-32.png")
export(16, "/home/user/app/qr/icons/favicon-16.png")

print("icons generated")
