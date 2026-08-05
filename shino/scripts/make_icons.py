#!/usr/bin/env python3
"""Generate a watercolor-style Shino-ware chawan (tea bowl) app icon set for 志野手帖."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(24)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ---------- watercolor background blobs ----------
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

palette = [
    (191, 90, 53, 255),    # 緋色 hi-iro (fire orange-red)
    (214, 168, 88, 255),   # 金 gold
    (168, 150, 130, 255),  # 鼠志野 grey-beige
    (236, 214, 178, 255),  # 乳白 milky cream
]

base = Image.new("RGBA", (SIZE, SIZE), (250, 243, 229, 255))  # warm milky cream
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

blob(bg, SIZE*0.28, SIZE*0.26, SIZE*0.32, palette[0], 110)
blob(bg, SIZE*0.76, SIZE*0.24, SIZE*0.28, palette[1], 110)
blob(bg, SIZE*0.70, SIZE*0.76, SIZE*0.34, palette[2], 100)
blob(bg, SIZE*0.24, SIZE*0.74, SIZE*0.28, palette[3], 110)
blob(bg, SIZE*0.5, SIZE*0.5, SIZE*0.46, palette[0], 40)

img.alpha_composite(bg)

draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, int(SIZE * 0.52)

# ---------- soft ring ----------
r_outer = SIZE * 0.40
draw.ellipse([cx - r_outer, cy - r_outer * 0.98, cx + r_outer, cy + r_outer * 0.98],
             outline=(255, 255, 255, 210), width=int(SIZE * 0.012))

# ---------- chawan (tea bowl) body: milky-white shino glaze ----------
bowl_w, bowl_h = SIZE*0.52, SIZE*0.30
bowl_top = cy - SIZE*0.02
glaze = (243, 233, 213, 255)
draw.pieslice([cx - bowl_w/2, bowl_top - bowl_h*0.35, cx + bowl_w/2, bowl_top + bowl_h*1.15],
              start=0, end=180, fill=glaze)

# bowl foot ring (high-fired clay body, reddish where glaze is thin)
foot = (176, 112, 74, 255)
draw.ellipse([cx - bowl_w*0.16, bowl_top + bowl_h*0.98, cx + bowl_w*0.16, bowl_top + bowl_h*1.14], fill=foot)

# rim highlight
draw.arc([cx - bowl_w/2, bowl_top - bowl_h*0.16, cx + bowl_w/2, bowl_top + bowl_h*0.16],
          start=190, end=350, fill=(255, 252, 244, 230), width=int(SIZE*0.014))

# ---------- hi-iro fire-color blush (orange glaze edge, signature of shino-yaki) ----------
blush = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bd = ImageDraw.Draw(blush)
bd.pieslice([cx - bowl_w*0.46, bowl_top - bowl_h*0.30, cx + bowl_w*0.02, bowl_top + bowl_h*0.55],
            start=140, end=250, fill=(191, 90, 53, 150))
bd.pieslice([cx - bowl_w*0.05, bowl_top - bowl_h*0.10, cx + bowl_w*0.5, bowl_top + bowl_h*0.7],
            start=300, end=45, fill=(191, 90, 53, 110))
blush = blush.filter(ImageFilter.GaussianBlur(SIZE*0.02))
img.alpha_composite(blush)

# ---------- kannyu crackle lines on the glaze (fine, hand-like) ----------
crackle = (150, 108, 74, 130)
crack_paths = [
    [(-0.16,-0.02),(-0.10,0.05),(-0.13,0.12),(-0.06,0.17)],
    [(0.02,-0.05),(0.06,0.02),(0.02,0.09),(0.08,0.15)],
    [(0.16,-0.01),(0.12,0.06),(0.17,0.13)],
]
for path in crack_paths:
    pts = [(cx + dx*SIZE, bowl_top + dy*SIZE + bowl_h*0.35) for dx, dy in path]
    draw.line(pts, fill=crackle, width=max(1, int(SIZE*0.002)), joint="curve")

# ---------- steam wisp (a warm cup of tea, everyday use) ----------
steam = (255, 255, 255, 170)
for sx in (-0.09, 0.0, 0.09):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(layer)
    x0 = cx + sx*SIZE
    y0 = bowl_top - bowl_h*0.5
    pts = []
    steps = 24
    for i in range(steps + 1):
        t = i / steps
        x = x0 + math.sin(t * math.pi * 1.6) * SIZE*0.028
        y = y0 - t * SIZE*0.16
        pts.append((x, y))
    sd.line(pts, fill=steam, width=int(SIZE*0.011), joint="curve")
    layer = layer.filter(ImageFilter.GaussianBlur(SIZE*0.008))
    img.alpha_composite(layer)

img.save("/home/user/app/shino/icons/icon-source.png")

def export(size, path, maskable=False, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if maskable:
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size), (250, 243, 229, 255))
        inner = img.resize((size - pad*2, size - pad*2), Image.LANCZOS)
        canvas.alpha_composite(inner, (pad, pad))
        im = canvas
    if opaque:
        canvas = Image.new("RGB", (size, size), (250, 243, 229))
        canvas.paste(im, (0, 0), im)
        im = canvas
    im.save(path)

export(192, "/home/user/app/shino/icons/icon-192.png")
export(512, "/home/user/app/shino/icons/icon-512.png")
export(192, "/home/user/app/shino/icons/icon-maskable-192.png", maskable=True)
export(512, "/home/user/app/shino/icons/icon-maskable-512.png", maskable=True)
export(180, "/home/user/app/shino/icons/apple-touch-icon.png", opaque=True)
export(32, "/home/user/app/shino/icons/favicon-32.png")
export(16, "/home/user/app/shino/icons/favicon-16.png")

print("icons generated")
