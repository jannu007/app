#!/usr/bin/env python3
"""Generate original watercolor-style illustrations for the 志野図鑑 encyclopedia app.

All images are original illustrations created for this app (not photographs of
real museum objects), so they are free to use and safe for commercial use.
Pieces described as famous historical works (Unohanagaki, Hirosawa) are
artistic impressions ("image illustrations"), not reproductions of the real
artifacts.
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

OUT = "/home/user/app/shino/img"
random.seed(7)

CREAM = (250, 243, 229, 255)


def soft_bg(size, blobs):
    """Watercolor-blob background, consistent with the app's visual language."""
    img = Image.new("RGBA", (size, size), CREAM)
    for cx, cy, r, color, alpha in blobs:
        layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        pts = []
        n = 14
        for i in range(n):
            ang = 2 * math.pi * i / n
            rr = r * (0.8 + 0.35 * random.random())
            x = cx + rr * math.cos(ang)
            y = cy + rr * math.sin(ang)
            pts.append((x, y))
        d.polygon(pts, fill=(*color, alpha))
        layer = layer.filter(ImageFilter.GaussianBlur(size * 0.05))
        img.alpha_composite(layer)
    return img


def draw_bowl(
    filename,
    size=640,
    glaze=(243, 233, 213),
    pattern="none",
    rim_blush="soft",
    wobble=False,
    label=None,
):
    bg_blobs = [
        (size * 0.24, size * 0.22, size * 0.30, (191, 90, 53), 70),
        (size * 0.78, size * 0.20, size * 0.26, (214, 168, 88), 70),
        (size * 0.72, size * 0.80, size * 0.30, (168, 150, 130), 60),
        (size * 0.20, size * 0.80, size * 0.26, (236, 214, 178), 70),
    ]
    img = soft_bg(size, bg_blobs)
    draw = ImageDraw.Draw(img)

    cx, cy = size // 2, int(size * 0.50)
    bowl_w, bowl_h = size * 0.62, size * 0.36
    bowl_top = cy - size * 0.02

    # soft ring frame
    r_outer = size * 0.44
    draw.ellipse(
        [cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer],
        outline=(255, 255, 255, 190),
        width=max(2, int(size * 0.008)),
    )

    def rim_points(n=48, jitter=0.0):
        pts = []
        for i in range(n + 1):
            t = math.pi * i / n
            rx = bowl_w / 2 * (1 + (random.uniform(-jitter, jitter) if jitter else 0))
            ry = bowl_h * 0.55 * (1 + (random.uniform(-jitter, jitter) if jitter else 0))
            x = cx + rx * math.cos(t)
            y = bowl_top + ry * math.sin(t) * -1 if False else bowl_top
            pts.append((x, t))
        return pts

    # bowl body (pieslice, slightly wobbly rim for the "yugami" hand-warped look)
    if wobble:
        n = 40
        pts = [(cx - bowl_w / 2, bowl_top)]
        for i in range(n + 1):
            t = math.pi * i / n
            wob = 1 + 0.05 * math.sin(t * 5 + 1.3) + random.uniform(-0.02, 0.02)
            x = cx + (bowl_w / 2) * math.cos(math.pi - t)
            y = bowl_top + bowl_h * 1.05 * wob * math.sin(t)
            pts.append((x, y))
        pts.append((cx + bowl_w / 2, bowl_top))
        draw.polygon(pts, fill=(*glaze, 255))
    else:
        draw.pieslice(
            [cx - bowl_w / 2, bowl_top - bowl_h * 0.35, cx + bowl_w / 2, bowl_top + bowl_h * 1.15],
            start=0, end=180, fill=(*glaze, 255),
        )

    # clay foot
    foot = (176, 112, 74, 255)
    draw.ellipse(
        [cx - bowl_w * 0.17, bowl_top + bowl_h * 1.0, cx + bowl_w * 0.17, bowl_top + bowl_h * 1.17],
        fill=foot,
    )

    # ---- pattern overlays ----
    if pattern == "e":
        # iron-brown brush-painted grass/leaf motif (絵志野)
        ink = (94, 60, 36, 220)
        for gx in (-0.20, -0.02, 0.17):
            bx = cx + gx * size
            by = bowl_top + bowl_h * 0.55
            for k in range(3):
                x0 = bx + k * size * 0.02 - size * 0.02
                draw.line(
                    [(x0, by + size * 0.06), (x0 - size * 0.01, by - size * 0.05), (x0 + size * 0.012, by - size * 0.09)],
                    fill=ink, width=max(2, int(size * 0.008)), joint="curve",
                )

    elif pattern == "nezumi":
        # iron slip base with scratched-through white pattern (鼠志野)
        slip = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sd = ImageDraw.Draw(slip)
        sd.pieslice(
            [cx - bowl_w / 2, bowl_top - bowl_h * 0.35, cx + bowl_w / 2, bowl_top + bowl_h * 1.15],
            start=0, end=180, fill=(118, 100, 88, 235),
        )
        img.alpha_composite(slip)
        draw = ImageDraw.Draw(img)
        white = (245, 238, 222, 235)
        for gx in (-0.19, -0.02, 0.16):
            bx = cx + gx * size
            by = bowl_top + bowl_h * 0.52
            draw.line(
                [(bx, by + size * 0.08), (bx - size * 0.015, by), (bx + size * 0.01, by - size * 0.08)],
                fill=white, width=max(2, int(size * 0.01)), joint="curve",
            )
        draw.ellipse([cx - bowl_w * 0.17, bowl_top + bowl_h * 1.0, cx + bowl_w * 0.17, bowl_top + bowl_h * 1.17], fill=foot)

    elif pattern == "beni":
        # warm red-ochre wash beneath fine iron lines (紅志野・赤志野)
        wash = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        wd = ImageDraw.Draw(wash)
        wd.pieslice(
            [cx - bowl_w / 2, bowl_top - bowl_h * 0.35, cx + bowl_w / 2, bowl_top + bowl_h * 1.15],
            start=0, end=180, fill=(196, 118, 78, 150),
        )
        wash = wash.filter(ImageFilter.GaussianBlur(size * 0.01))
        img.alpha_composite(wash)
        draw = ImageDraw.Draw(img)
        ink = (110, 60, 38, 200)
        for gx in (-0.14, 0.06):
            bx = cx + gx * size
            by = bowl_top + bowl_h * 0.5
            draw.line([(bx, by + size * 0.07), (bx + size * 0.02, by - size * 0.06)], fill=ink, width=max(2, int(size * 0.007)))

    elif pattern == "neriage":
        # marbled white + red clay (練上手)
        marble = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        md = ImageDraw.Draw(marble)
        mask = Image.new("L", (size, size), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.pieslice(
            [cx - bowl_w / 2, bowl_top - bowl_h * 0.35, cx + bowl_w / 2, bowl_top + bowl_h * 1.15],
            start=0, end=180, fill=255,
        )
        for i in range(10):
            y = bowl_top - bowl_h * 0.3 + i * bowl_h * 0.16
            wob = size * 0.03 * math.sin(i * 1.7)
            md.line([(cx - bowl_w * 0.55, y + wob), (cx + bowl_w * 0.55, y - wob)],
                    fill=(198, 130, 96, 255), width=max(3, int(size * 0.028)))
        marble.putalpha(Image.composite(marble.split()[3], Image.new("L", (size, size), 0), mask))
        img.alpha_composite(marble)
        draw = ImageDraw.Draw(img)

    elif pattern == "unohanagaki":
        # abstract hedge-like crosshatch iron lines (卯花墻 image illustration)
        ink = (70, 46, 30, 190)
        for i in range(6):
            x0 = cx - bowl_w * 0.32 + i * bowl_w * 0.13
            draw.line([(x0, bowl_top + bowl_h * 0.15), (x0 + bowl_w * 0.05, bowl_top + bowl_h * 0.62)],
                      fill=ink, width=max(2, int(size * 0.006)))
        for i in range(3):
            y0 = bowl_top + bowl_h * (0.28 + i * 0.14)
            draw.line([(cx - bowl_w * 0.28, y0), (cx + bowl_w * 0.28, y0 + size * 0.01)],
                      fill=(40, 30, 24, 150), width=max(1, int(size * 0.004)))

    # rim fire-color blush (緋色) — sits just inside the rim edge, within the bowl's own silhouette
    if rim_blush:
        blush = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        bd = ImageDraw.Draw(blush)
        strength = 175 if rim_blush == "strong" else 110
        bbox = [cx - bowl_w / 2, bowl_top - bowl_h * 0.35, cx + bowl_w / 2, bowl_top + bowl_h * 1.15]
        bd.pieslice(bbox, start=145, end=180, fill=(191, 90, 53, strength))
        bd.pieslice(bbox, start=0, end=35, fill=(191, 90, 53, int(strength * 0.85)))
        blush = blush.filter(ImageFilter.GaussianBlur(size * 0.018))
        # clip to the bowl silhouette so the blush never floats above the rim line
        clip_mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(clip_mask).pieslice(bbox, start=0, end=180, fill=255)
        blush.putalpha(Image.composite(blush.split()[3], Image.new("L", (size, size), 0), clip_mask))
        img.alpha_composite(blush)

    draw = ImageDraw.Draw(img)
    draw.arc([cx - bowl_w / 2, bowl_top - bowl_h * 0.16, cx + bowl_w / 2, bowl_top + bowl_h * 0.16],
              start=190, end=350, fill=(255, 252, 244, 210), width=max(2, int(size * 0.01)))

    img.convert("RGB").save(f"{OUT}/{filename}", quality=92)
    print("saved", filename)


# ---------------- 志野の種類 ----------------
draw_bowl("type-mujishino.png", pattern="none", rim_blush="soft")
draw_bowl("type-eshino.png", pattern="e", rim_blush="soft")
draw_bowl("type-nezumishino.png", pattern="nezumi", rim_blush=None)
draw_bowl("type-benishino.png", pattern="beni", rim_blush="strong")
draw_bowl("type-neriage.png", pattern="neriage", rim_blush="soft")

# ---------------- 名品（イメージ画） ----------------
draw_bowl("piece-unohanagaki.png", pattern="unohanagaki", rim_blush="strong", wobble=True,
          glaze=(244, 236, 219))
draw_bowl("piece-hirosawa.png", pattern="beni", rim_blush="strong", glaze=(246, 235, 214))


# ---------------- ヒーローバナー（美濃の山と登り窯） ----------------
def hero_banner(filename, w=1200, h=600):
    img = Image.new("RGBA", (w, h), (250, 243, 229, 255))
    # sky wash
    sky = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sky)
    sd.ellipse([-w * 0.2, -h * 0.6, w * 0.9, h * 0.7], fill=(214, 168, 88, 90))
    sd.ellipse([w * 0.4, -h * 0.5, w * 1.3, h * 0.6], fill=(191, 90, 53, 70))
    sky = sky.filter(ImageFilter.GaussianBlur(w * 0.04))
    img.alpha_composite(sky)

    draw = ImageDraw.Draw(img)
    # rolling Mino hills
    hill_colors = [(168, 150, 130, 200), (140, 130, 96, 200), (108, 122, 68, 210)]
    base_ys = [h * 0.62, h * 0.72, h * 0.82]
    for idx, (color, base_y) in enumerate(zip(hill_colors, base_ys)):
        pts = [(0, h)]
        n = 10
        for i in range(n + 1):
            x = w * i / n
            y = base_y + math.sin(i * 1.3 + idx) * h * 0.035
            pts.append((x, y))
        pts.append((w, h))
        draw.polygon(pts, fill=color)

    # climbing kiln (anagama) silhouette on the middle hill
    kx, ky = w * 0.66, h * 0.60
    kiln_color = (120, 82, 56, 255)
    for i in range(4):
        seg_w = w * 0.07 - i * w * 0.006
        seg_h = h * 0.05
        x0 = kx + i * w * 0.055
        y0 = ky - i * h * 0.028
        draw.rounded_rectangle([x0, y0, x0 + seg_w, y0 + seg_h], radius=h * 0.012, fill=kiln_color)

    # smoke wisps
    smoke = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    smd = ImageDraw.Draw(smoke)
    for sx in (kx + w * 0.02, kx + w * 0.05):
        pts = []
        steps = 20
        for i in range(steps + 1):
            t = i / steps
            x = sx + math.sin(t * math.pi * 1.4) * w * 0.02
            y = ky - h * 0.03 - t * h * 0.22
            pts.append((x, y))
        smd.line(pts, fill=(250, 246, 238, 150), width=int(h * 0.012), joint="curve")
    smoke = smoke.filter(ImageFilter.GaussianBlur(h * 0.008))
    img.alpha_composite(smoke)

    # a few bowl silhouettes in foreground
    draw = ImageDraw.Draw(img)
    for bx, by, s in [(w * 0.16, h * 0.90, 1.0), (w * 0.27, h * 0.94, 0.7)]:
        draw.pieslice([bx - 40 * s, by - 14 * s, bx + 40 * s, by + 34 * s], start=0, end=180,
                      fill=(243, 233, 213, 255))
        draw.arc([bx - 40 * s, by - 14 * s, bx + 40 * s, by + 14 * s], start=190, end=350,
                  fill=(255, 252, 244, 200), width=3)

    img.convert("RGB").save(f"{OUT}/{filename}", quality=92)
    print("saved", filename)


hero_banner("hero-shino.png")
print("done")
