#!/usr/bin/env python3
"""Generate a watercolor-style bulldog-face app icon set for ブル手帖."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(11)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (189, 91, 43, 255),    # 朱茶色 rust / brindle
    (214, 168, 88, 255),   # 金 gold
    (108, 122, 68, 255),   # オリーブ olive
    (224, 182, 132, 255),  # フォーン fawn
]

base = Image.new("RGBA", (SIZE, SIZE), (250, 241, 227, 255))  # warm cream
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
blob(bg, SIZE*0.74, SIZE*0.26, SIZE*0.30, palette[1], 130)
blob(bg, SIZE*0.66, SIZE*0.74, SIZE*0.36, palette[2], 120)
blob(bg, SIZE*0.26, SIZE*0.72, SIZE*0.28, palette[3], 110)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[0], 50)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, int(SIZE * 0.54)

# ---------- soft ring ----------
r_outer = SIZE * 0.40
draw.ellipse([cx - r_outer, cy - r_outer * 0.98, cx + r_outer, cy + r_outer * 0.98],
             outline=(255, 255, 255, 220), width=int(SIZE * 0.012))

# ---------- bulldog rose ears (small, folded, set high) ----------
ear = (150, 92, 50, 255)
def rose_ear(flip=1):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ex = cx + flip * SIZE*0.225
    ey = cy - SIZE*0.235
    ew, eh = SIZE*0.135, SIZE*0.105
    ld.ellipse([ex - ew/2, ey - eh/2, ex + ew/2, ey + eh/2], fill=ear)
    layer = layer.rotate(flip * -18, center=(ex, ey), resample=Image.BICUBIC)
    img.alpha_composite(layer)
rose_ear(-1)
rose_ear(1)

# ---------- head (fawn), wide & flat like a bulldog ----------
fawn = (224, 182, 132, 255)
head_w, head_h = SIZE*0.56, SIZE*0.40
draw.ellipse([cx - head_w/2, cy - head_h/2 - SIZE*0.045, cx + head_w/2, cy + head_h/2 - SIZE*0.045], fill=fawn)

# wrinkle lines (forehead) — bulldogs have heavy wrinkles
wrinkle = (150, 108, 62, 150)
for i, dy in enumerate([-0.175, -0.135, -0.098, -0.064]):
    y = cy + SIZE*dy
    spread = SIZE*(0.125 - i*0.014)
    draw.arc([cx - spread, y - SIZE*0.022, cx + spread, y + SIZE*0.05], start=15, end=165, fill=wrinkle, width=int(SIZE*0.009))

# ---------- eyes ----------
eye = (43, 32, 26, 255)
eye_r = SIZE * 0.030
draw.ellipse([cx - SIZE*0.15 - eye_r, cy - SIZE*0.015 - eye_r, cx - SIZE*0.15 + eye_r, cy - SIZE*0.015 + eye_r], fill=eye)
draw.ellipse([cx + SIZE*0.15 - eye_r, cy - SIZE*0.015 - eye_r, cx + SIZE*0.15 + eye_r, cy - SIZE*0.015 + eye_r], fill=eye)
# eye shine
shine_r = SIZE*0.008
draw.ellipse([cx - SIZE*0.143 - shine_r, cy - SIZE*0.025 - shine_r, cx - SIZE*0.143 + shine_r, cy - SIZE*0.025 + shine_r], fill=(255,255,255,220))
draw.ellipse([cx + SIZE*0.157 - shine_r, cy - SIZE*0.025 - shine_r, cx + SIZE*0.157 + shine_r, cy - SIZE*0.025 + shine_r], fill=(255,255,255,220))

# ---------- jowls (hanging wide past the mouth) ----------
jowl = (232, 200, 158, 255)
draw.ellipse([cx - SIZE*0.24, cy + SIZE*0.03, cx + SIZE*0.24, cy + SIZE*0.235], fill=jowl)

# ---------- nose ----------
nose_w, nose_h = SIZE*0.125, SIZE*0.08
draw.rounded_rectangle([cx - nose_w/2, cy - SIZE*0.01, cx + nose_w/2, cy - SIZE*0.01 + nose_h],
                        radius=SIZE*0.032, fill=(28, 20, 16, 255))
# nostrils
nr = SIZE*0.013
draw.ellipse([cx - SIZE*0.034 - nr, cy + SIZE*0.022 - nr, cx - SIZE*0.034 + nr, cy + SIZE*0.022 + nr], fill=(60,44,36,255))
draw.ellipse([cx + SIZE*0.034 - nr, cy + SIZE*0.022 - nr, cx + SIZE*0.034 + nr, cy + SIZE*0.022 + nr], fill=(60,44,36,255))

# ---------- underbite mouth ----------
mouth = (60, 42, 32, 255)
draw.arc([cx - SIZE*0.11, cy + SIZE*0.06, cx + SIZE*0.11, cy + SIZE*0.19], start=10, end=170, fill=mouth, width=int(SIZE*0.015))
# small lower fangs (underbite)
fang = (250, 246, 236, 255)
draw.polygon([(cx - SIZE*0.075, cy + SIZE*0.145), (cx - SIZE*0.055, cy + SIZE*0.145), (cx - SIZE*0.065, cy + SIZE*0.175)], fill=fang)
draw.polygon([(cx + SIZE*0.075, cy + SIZE*0.145), (cx + SIZE*0.055, cy + SIZE*0.145), (cx + SIZE*0.065, cy + SIZE*0.175)], fill=fang)

img.save("/home/user/app/bulldog/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (250, 241, 227, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (250, 241, 227))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/bulldog/icons/icon-192.png")
export(512, "/home/user/app/bulldog/icons/icon-512.png")
export(192, "/home/user/app/bulldog/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/bulldog/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/bulldog/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/bulldog/icons/favicon-32.png")
export(16, "/home/user/app/bulldog/icons/favicon-16.png")

print("icons generated")
