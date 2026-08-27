#!/usr/bin/env python3
"""長野県77市町村のSVGパス（js/map.js）を生成する。

入力: 国土交通省 国土数値情報「行政区域データ 2025年版」(CC BY 4.0) を
      npm パッケージ japan-choropleth (CC BY 4.0) が加工した GeoJSON。
      package/data/geojson/by-prefecture/20/municipalities.geojson

  npm pack japan-choropleth などで取得したファイルのパスを引数に渡します。
      python3 scripts/make_map.py path/to/municipalities.geojson

出力: js/map.js  （viewBox と、市町村名 -> SVGパス／代表点）
"""
import json
import math
import sys
import unicodedata

SRC = sys.argv[1] if len(sys.argv) > 1 else "municipalities.geojson"
OUT = "/home/user/app/nagano/js/map.js"
WIDTH = 1000.0
PAD = 6.0
PREC = 1  # SVG座標の小数桁

data = json.load(open(SRC, encoding="utf-8"))
feats = data["features"]

def rings(geom):
    """ポリゴン外環・内環を [(ring, is_hole)] で返す。"""
    out = []
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        return out
    for poly in polys:
        for i, ring in enumerate(poly):
            out.append((ring, i > 0))
    return out

# ---- 投影（正距円筒 + 緯度補正）----
lons, lats = [], []
for f in feats:
    for ring, _ in rings(f["geometry"]):
        for lon, lat in ring:
            lons.append(lon)
            lats.append(lat)
lat0 = (min(lats) + max(lats)) / 2
k = math.cos(math.radians(lat0))
xs = [lon * k for lon in lons]
minx, maxx = min(xs), max(xs)
miny, maxy = -max(lats), -min(lats)
scale = (WIDTH - PAD * 2) / (maxx - minx)
height = (maxy - miny) * scale + PAD * 2

def project(lon, lat):
    return (lon * k - minx) * scale + PAD, (-lat - miny) * scale + PAD

def fmt(v):
    s = f"{v:.{PREC}f}"
    return s[:-2] if s.endswith(".0") else s

def ring_area(pts):
    a = 0.0
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        a += x0 * y1 - x1 * y0
    return a / 2

def ring_centroid(pts):
    a = cx = cy = 0.0
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    a /= 2
    if a == 0:
        return pts[0]
    return cx / (6 * a), cy / (6 * a)

entries = []
for f in feats:
    name = f["properties"].get("municipality") or f["properties"].get("displayName")
    name = unicodedata.normalize("NFKC", name)
    d_parts = []
    biggest = (0.0, None)
    for ring, _hole in rings(f["geometry"]):
        pts = [project(lon, lat) for lon, lat in ring]
        # 連続する重複点を間引く
        dedup = [pts[0]]
        for p in pts[1:]:
            if abs(p[0] - dedup[-1][0]) > 0.05 or abs(p[1] - dedup[-1][1]) > 0.05:
                dedup.append(p)
        if len(dedup) < 3:
            continue
        if dedup[0] != dedup[-1]:
            dedup.append(dedup[0])
        area = abs(ring_area(dedup))
        if area > biggest[0]:
            biggest = (area, dedup)
        seg = "M" + " ".join(f"{fmt(x)},{fmt(y)}" for x, y in dedup[:-1]) + "Z"
        d_parts.append(seg)
    cx, cy = ring_centroid(biggest[1]) if biggest[1] else (0, 0)
    entries.append((name, "".join(d_parts), round(cx, 1), round(cy, 1)))

entries.sort(key=lambda e: e[0])
with open(OUT, "w", encoding="utf-8") as fp:
    fp.write("/* =========================================================\n")
    fp.write("   信州まちしるべ - 長野県77市町村の地図データ（自動生成）\n")
    fp.write("   scripts/make_map.py で生成。手で編集しないでください。\n\n")
    fp.write("   出典: 国土交通省 国土数値情報「行政区域データ 2025年版」\n")
    fp.write("         (CC BY 4.0) を加工して作成。\n")
    fp.write("   ========================================================= */\n\n")
    fp.write(f'const MAP_VIEWBOX = "0 0 {int(WIDTH)} {int(round(height))}";\n\n')
    fp.write("const MAP_SHAPES = {\n")
    for name, d, cx, cy in entries:
        fp.write(f'  "{name}": {{ d: "{d}", cx: {cx}, cy: {cy} }},\n')
    fp.write("};\n")

print(f"{len(entries)} municipalities -> {OUT}  viewBox 0 0 {int(WIDTH)} {int(round(height))}")
