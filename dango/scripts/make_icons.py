#!/usr/bin/env python3
"""Generate a watercolor-style tri-color dango (skewered mochi) app icon set."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(7)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (219, 112, 132, 255),  # 桜色
    (196, 149, 82, 255),   # きなこ色
    (122, 150, 92, 255),   # よもぎ色
    (240, 168, 184, 255),  # 淡い桜
]

base = Image.new("RGBA", (SIZE, SIZE), (251, 243, 228, 255))  # 温かいクリーム
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

blob(bg, SIZE*0.28, SIZE*0.26, SIZE*0.32, palette[0], 120)
blob(bg, SIZE*0.75, SIZE*0.24, SIZE*0.30, palette[1], 110)
blob(bg, SIZE*0.68, SIZE*0.76, SIZE*0.34, palette[2], 110)
blob(bg, SIZE*0.24, SIZE*0.74, SIZE*0.28, palette[3], 100)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx = SIZE // 2

# ---------- soft ring ----------
r_outer = SIZE * 0.40
cy_ring = int(SIZE * 0.54)
draw.ellipse([cx - r_outer, cy_ring - r_outer * 0.98, cx + r_outer, cy_ring + r_outer * 0.98],
             outline=(255, 255, 255, 210), width=int(SIZE * 0.012))

# ---------- skewer stick ----------
stick_color = (200, 160, 104, 255)
stick_w = SIZE * 0.05
top_y = SIZE * 0.09
bottom_y = SIZE * 0.92
draw.rounded_rectangle(
    [cx - stick_w/2, top_y, cx + stick_w/2, bottom_y],
    radius=stick_w/2, fill=stick_color
)
# subtle wood grain highlight
draw.line([(cx - stick_w*0.12, top_y + SIZE*0.02), (cx - stick_w*0.12, bottom_y - SIZE*0.02)],
          fill=(226, 194, 150, 160), width=int(SIZE*0.008))

# ---------- three dango balls (sakura mochi / shiratama / yomogi) ----------
ball_r = SIZE * 0.152
centers_y = [SIZE * 0.275, SIZE * 0.505, SIZE * 0.735]
colors = [
    ((242, 160, 182, 255), (255, 224, 232, 255), (199, 106, 134, 255)),  # 桜
    ((251, 246, 234, 255), (255, 255, 255, 255), (205, 194, 164, 255)),  # 白玉
    ((143, 174, 110, 255), (201, 222, 166, 255), (95, 125, 70, 255)),    # よもぎ
]

for cy, (fill, light, dark) in zip(centers_y, colors):
    # main ball
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r], fill=fill)
    # outline
    ld.ellipse([cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r], outline=dark, width=int(SIZE*0.006))
    img.alpha_composite(layer)
    # gloss highlight
    hi = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    hx, hy = cx - ball_r*0.35, cy - ball_r*0.4
    hd.ellipse([hx - ball_r*0.32, hy - ball_r*0.2, hx + ball_r*0.32, hy + ball_r*0.2], fill=(*light[:3], 170))
    hi = hi.filter(ImageFilter.GaussianBlur(SIZE * 0.01))
    img.alpha_composite(hi)

img.save("/home/user/app/dango/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (251, 243, 228, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (251, 243, 228))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/dango/icons/icon-192.png")
export(512, "/home/user/app/dango/icons/icon-512.png")
export(192, "/home/user/app/dango/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/dango/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/dango/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/dango/icons/favicon-32.png")
export(16, "/home/user/app/dango/icons/favicon-16.png")

print("icons generated")
