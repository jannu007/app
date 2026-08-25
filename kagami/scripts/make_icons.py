#!/usr/bin/env python3
"""うつし鏡 のアプリアイコンを生成する（和紙・水鏡の藍・朱をテーマにした手描き風）。

    python3 scripts/make_icons.py

で kagami/icons/ 以下に PNG 一式を書き出します。
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(21)

SIZE = 1024
PAPER = (250, 244, 231, 255)
INK = (58, 46, 40, 255)
MIZU = (74, 108, 148, 255)      # 水鏡の藍
MIZU_LIGHT = (122, 154, 188, 255)
STAMP = (176, 58, 46, 255)      # 朱
GOLD = (196, 149, 63, 255)


def blob(target, cx, cy, r, color, alpha, blur=0.035):
    """水彩のにじみのような不定形の色だまり"""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = []
    n = 16
    for i in range(n):
        ang = 2 * math.pi * i / n
        rr = r * (0.78 + 0.4 * random.random())
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=(*color[:3], alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(SIZE * blur))
    target.alpha_composite(layer)


def build(with_background=True, inset=0.0):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    if with_background:
        img.alpha_composite(Image.new("RGBA", (SIZE, SIZE), PAPER))
        blob(img, SIZE * 0.24, SIZE * 0.22, SIZE * 0.34, MIZU, 105)
        blob(img, SIZE * 0.80, SIZE * 0.26, SIZE * 0.26, GOLD, 95)
        blob(img, SIZE * 0.72, SIZE * 0.80, SIZE * 0.32, MIZU_LIGHT, 90)
        blob(img, SIZE * 0.22, SIZE * 0.80, SIZE * 0.24, STAMP, 60)

    cx, cy = SIZE / 2, SIZE / 2 - SIZE * 0.02
    # maskable 用に、中身を安全域へ縮める
    k = 1.0 - inset

    # ---------- 手鏡の輪郭（円） ----------
    mirror_r = SIZE * 0.30 * k
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(
        [cx - mirror_r, cy - mirror_r, cx + mirror_r, cy + mirror_r],
        fill=(252, 249, 242, 255),
        outline=INK,
        width=int(SIZE * 0.016 * k),
    )
    img.alpha_composite(layer)

    # ---------- 鏡に映る顔（墨の線） ----------
    face = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fd = ImageDraw.Draw(face)
    lw = max(2, int(SIZE * 0.014 * k))

    # 輪郭（下ぶくれの卵形をひと筆で）
    fw = mirror_r * 0.52
    fh = mirror_r * 0.66
    fd.ellipse(
        [cx - fw, cy - fh, cx + fw, cy + fh * 1.10],
        outline=INK, width=lw,
    )

    # 目（伏し目がちな二本の線）
    eye_y = cy - fh * 0.12
    eye_dx = fw * 0.46
    eye_w = fw * 0.28
    for sx in (-1, 1):
        ex = cx + sx * eye_dx
        fd.arc(
            [ex - eye_w, eye_y - eye_w * 0.7, ex + eye_w, eye_y + eye_w * 0.9],
            start=195, end=345, fill=INK, width=lw,
        )

    # 口（小さな朱の点）
    mw = fw * 0.13
    my = cy + fh * 0.42
    fd.ellipse([cx - mw, my - mw * 0.62, cx + mw, my + mw * 0.62], fill=STAMP)
    img.alpha_composite(face)

    # ---------- 鏡の下に溜まる水（水鏡の見立て） ----------
    water = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    wd = ImageDraw.Draw(water)
    wd.ellipse(
        [cx - mirror_r, cy - mirror_r, cx + mirror_r, cy + mirror_r],
        fill=(*MIZU[:3], 26),
    )
    water = water.filter(ImageFilter.GaussianBlur(SIZE * 0.02))
    img.alpha_composite(water)

    ripple = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ripple)
    for ry, rr, alpha in [(0.62, 0.66, 120), (0.76, 0.46, 90)]:
        y = cy + mirror_r * ry
        w = mirror_r * rr
        rd.arc(
            [cx - w, y - mirror_r * 0.10, cx + w, y + mirror_r * 0.10],
            start=0, end=180, fill=(*MIZU[:3], alpha), width=max(2, int(SIZE * 0.008 * k)),
        )
    img.alpha_composite(ripple)

    # ---------- 手鏡の柄 ----------
    handle = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(handle)
    hw = SIZE * 0.035 * k
    top = cy + mirror_r * 0.94
    bottom = cy + mirror_r * 1.42
    hd.rounded_rectangle(
        [cx - hw, top, cx + hw, bottom],
        radius=hw,
        fill=GOLD,
        outline=INK,
        width=int(SIZE * 0.009 * k),
    )
    img.alpha_composite(handle)

    return img


def save_set():
    base = build(with_background=True, inset=0.0)
    maskable = build(with_background=True, inset=0.16)

    out = {
        "icons/icon-512.png": (base, 512),
        "icons/icon-192.png": (base, 192),
        "icons/apple-touch-icon.png": (base, 180),
        "icons/favicon-32.png": (base, 32),
        "icons/favicon-16.png": (base, 16),
        "icons/icon-maskable-512.png": (maskable, 512),
        "icons/icon-maskable-192.png": (maskable, 192),
    }
    for path, (img, size) in out.items():
        img.resize((size, size), Image.LANCZOS).save(path)
        print("wrote", path)

    base.save("icons/icon-source.png")
    print("wrote icons/icon-source.png")


if __name__ == "__main__":
    save_set()
