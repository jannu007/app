/* ===========================================================
   うつし鏡 — 顔の特徴点にもとづく肌の解析

   js/analyze.js は肌色と明暗だけを頼りに顔の位置を推定していますが、
   実際の写真では額が髪に、あごが首に重なり、部位を取り違えることがあります。
   このファイルでは顔の特徴点（478点）を使い、

     1. 両目を水平にそろえ、目と目の間隔が一定になるように顔を正規化する
     2. 額・目尻・目の下・頬・ほうれい線・口元・フェイスラインを、
        その人の実際の位置に合わせて切り出す
     3. 照明の明るさに左右されない形で、線の深さや肌の粗さを測る

   という手順で測ります。特徴点が取れない写真では analyze.js が使われます。
   処理はすべて端末内で完結します。
   =========================================================== */
(() => {
  "use strict";

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const ramp = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

  function mean(a) {
    if (!a.length) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  function median(a) {
    if (!a.length) return 0;
    const b = Array.from(a).sort((x, y) => x - y);
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  /** 中央値からのばらつき。外れ値に強い */
  function madSpread(a) {
    if (a.length < 4) return 0;
    const m = median(a);
    return median(a.map((v) => Math.abs(v - m))) * 1.4826;
  }

  /* ---------------- 特徴点の番号 ---------------- */

  const L = {
    eyeA: [33, 133, 159, 145],     // 片方の目（目尻・目頭・上まぶた・下まぶた）
    eyeB: [263, 362, 386, 374],
    eyeAOuter: 33, eyeAInner: 133, eyeATop: 159, eyeABottom: 145,
    eyeBOuter: 263, eyeBInner: 362, eyeBTop: 386, eyeBBottom: 374,
    browA: 105, browB: 334,
    foreheadTop: 10,
    noseWingA: 129, noseWingB: 358,
    mouthA: 61, mouthB: 291,
    jawA: 172, jawB: 397,
    chin: 152,
    faceOval: [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
      379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
      234, 127, 162, 21, 54, 103, 67, 109,
    ],
    eyeRingA: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    eyeRingB: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    browRingA: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    browRingB: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
  };

  /* ---------------- 顔の正規化 ---------------- */

  // 正規化後の大きさ。目と目の間隔を IOD 画素に固定する
  const W = 300, H = 400, IOD = 100;
  const EYE_X = W / 2, EYE_Y = 150;

  /**
   * 両目が水平に、目と目の間隔が一定になるように顔を切り出す。
   * こうすると、顔の大きさ・傾き・撮影距離が変わっても
   * 同じ部位が同じ場所に来るので、写真どうしを同じ物差しで測れる。
   */
  function alignFace(source, landmarks) {
    const sw = source.width, sh = source.height;
    const pt = (i) => ({ x: landmarks[i].x * sw, y: landmarks[i].y * sh });
    const centroid = (ids) => {
      const ps = ids.map(pt);
      return { x: mean(ps.map((p) => p.x)), y: mean(ps.map((p) => p.y)) };
    };

    const eyeA = centroid(L.eyeA);
    const eyeB = centroid(L.eyeB);
    const dx = eyeB.x - eyeA.x, dy = eyeB.y - eyeA.y;
    const dist = Math.hypot(dx, dy);
    if (!(dist > 8)) return null;

    const angle = Math.atan2(dy, dx);
    const scale = IOD / dist;
    const mid = { x: (eyeA.x + eyeB.x) / 2, y: (eyeA.y + eyeB.y) / 2 };

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(EYE_X, EYE_Y);
    ctx.rotate(-angle);
    ctx.scale(scale, scale);
    ctx.translate(-mid.x, -mid.y);
    ctx.drawImage(source, 0, 0);
    ctx.restore();

    // 同じ変換で特徴点も移す
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    const map = (i) => {
      const p = pt(i);
      const x = (p.x - mid.x) * scale, y = (p.y - mid.y) * scale;
      return { x: EYE_X + x * cos - y * sin, y: EYE_Y + x * sin + y * cos };
    };

    return { canvas, ctx, map, scale, angle };
  }

  /* ---------------- マスク（測ってよい画素） ---------------- */

  /**
   * 顔の輪郭の内側から、目・眉・唇を除いた範囲を作る。
   * 髪・眼鏡・ひげのような濃い部分は、明るさが極端に外れる画素として別に外す。
   */
  function buildMask(aligned, planes) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext("2d", { willReadFrequently: true });

    const fill = (ids, style) => {
      c.fillStyle = style;
      c.beginPath();
      ids.forEach((id, i) => {
        const p = aligned.map(id);
        if (i === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      });
      c.closePath();
      c.fill();
    };

    c.fillStyle = "#000";
    c.fillRect(0, 0, W, H);
    fill(L.faceOval, "#fff");
    // 目・眉・唇はしわの測定対象から外す
    [L.eyeRingA, L.eyeRingB, L.browRingA, L.browRingB, L.lips].forEach((ids) => fill(ids, "#000"));

    const data = c.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] > 127 ? 1 : 0;

    // 髪や眼鏡など、肌としては暗すぎる・明るすぎる画素を外す
    const inside = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) inside.push(planes.Lum[i]);
    if (inside.length > 100) {
      const med = median(inside);
      const spread = Math.max(12, madSpread(inside));
      const lo = med - 3.0 * spread, hi = med + 3.0 * spread;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] && (planes.Lum[i] < lo || planes.Lum[i] > hi)) mask[i] = 0;
      }
    }
    return mask;
  }

  /* ---------------- 画素の面（明るさ・赤み・黄み） ---------------- */

  function toPlanes(imageData) {
    const n = W * H;
    const d = imageData.data;
    const Lum = new Float32Array(n), RG = new Float32Array(n), YB = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      Lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      RG[i] = r - g;
      YB[i] = (r + g) / 2 - b;
    }
    return { Lum, RG, YB };
  }

  function boxBlur(src, r) {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    const win = 2 * r + 1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[row + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum / win;
        sum -= src[row + clamp(x - r, 0, W - 1)];
        sum += src[row + clamp(x + r + 1, 0, W - 1)];
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = sum / win;
        sum -= tmp[clamp(y - r, 0, H - 1) * W + x];
        sum += tmp[clamp(y + r + 1, 0, H - 1) * W + x];
      }
    }
    return out;
  }

  /* ---------------- 測る ---------------- */

  /** 矩形（中心・幅・高さ・傾き）の中で、マスクの立っている画素を列挙する */
  function samplesIn(mask, rect, fn) {
    const { cx, cy, w, h, rot = 0 } = rect;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const out = [];
    const rad = Math.ceil(Math.max(w, h) / 2) + 1;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        // 傾いた矩形の内側か
        const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
        if (Math.abs(u) > w / 2 || Math.abs(v) > h / 2) continue;
        const x = Math.round(cx + dx), y = Math.round(cy + dy);
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const i = y * W + x;
        if (!mask[i]) continue;
        out.push(fn(i, u, v));
      }
    }
    return out;
  }

  /**
   * 線（しわ・ほうれい線）の深さ。
   *
   * ぼかした画像との差を取ると細かい凹凸が残る。その振幅を、
   * その部位自身の明るさで割ることで、照明の強さに左右されない値にする
   * （明るく写っても暗く写っても、同じしわなら同じ値になる）。
   */
  function lineDepth(planes, mask, rect, radius) {
    const detail = subtractBlur(planes.Lum, radius);
    const vals = samplesIn(mask, rect, (i) => detail[i]);
    const lum = samplesIn(mask, rect, (i) => planes.Lum[i]);
    if (vals.length < 60) return null;
    const base = clamp(median(lum), 30, 250);
    const abs = vals.map(Math.abs).sort((a, b) => a - b);
    const strong = abs[Math.floor(abs.length * 0.92)];
    return (strong / base) * 100;
  }

  const blurCache = new Map();
  function subtractBlur(src, radius) {
    const key = radius;
    let blurred = blurCache.get(key);
    if (!blurred) {
      blurred = boxBlur(src, radius);
      blurCache.set(key, blurred);
    }
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = src[i] - blurred[i];
    return out;
  }

  /** 肌の粗さ（キメ）。ごく細かい凹凸のばらつきを、明るさで割る */
  function roughness(planes, mask, rect) {
    const detail = subtractBlur(planes.Lum, 1);
    const vals = samplesIn(mask, rect, (i) => detail[i]);
    const lum = samplesIn(mask, rect, (i) => planes.Lum[i]);
    if (vals.length < 60) return null;
    const base = clamp(median(lum), 30, 250);
    return (madSpread(vals) / base) * 100;
  }

  /** 部位の明るさ（中央値）。影の影響を減らすため中央値を使う */
  function brightness(planes, mask, rect) {
    const lum = samplesIn(mask, rect, (i) => planes.Lum[i]);
    return lum.length < 40 ? null : median(lum);
  }

  /**
   * 色ムラ。
   * 照明のなだらかな明暗を大きなぼかしで取り除いてから、
   * 赤みのばらつきだけを見る（そうしないと影の勾配をムラと誤認する）。
   */
  function unevenness(planes, mask, rect) {
    const detail = subtractBlur(planes.RG, 12);
    const vals = samplesIn(mask, rect, (i) => detail[i]);
    if (vals.length < 60) return null;
    return madSpread(vals);
  }

  /** 黄み（くすみ）。明るさで割って相対値にする */
  function yellowness(planes, mask, rect) {
    const yb = samplesIn(mask, rect, (i) => planes.YB[i]);
    const lum = samplesIn(mask, rect, (i) => planes.Lum[i]);
    if (yb.length < 40) return null;
    return (median(yb) / clamp(median(lum), 30, 250)) * 100;
  }

  /* ---------------- 部位の切り出し ---------------- */

  /**
   * その人の特徴点から、測る場所を決める。
   * 目と目の間隔（IOD）を単位にしているので、顔の大小に関係なく同じ場所になる。
   */
  function regionsOf(a) {
    const p = a.map;
    const eyeAO = p(L.eyeAOuter), eyeAI = p(L.eyeAInner);
    const eyeBO = p(L.eyeBOuter), eyeBI = p(L.eyeBInner);
    const eyeAC = { x: (eyeAO.x + eyeAI.x) / 2, y: (eyeAO.y + eyeAI.y) / 2 };
    const eyeBC = { x: (eyeBO.x + eyeBI.x) / 2, y: (eyeBO.y + eyeBI.y) / 2 };
    const browY = Math.min(p(L.browA).y, p(L.browB).y);
    const topY = p(L.foreheadTop).y;
    const u = IOD; // 長さの単位

    // 額: 眉の上から、生え際の少し下まで
    const foreH = Math.max(0.18 * u, (browY - topY) * 0.44);
    const forehead = {
      cx: (p(L.browA).x + p(L.browB).x) / 2,
      cy: browY - (browY - topY) * 0.42,
      w: Math.abs(p(L.browB).x - p(L.browA).x) * 1.05,
      h: foreH,
    };

    // 目尻（外側）
    const crow = (outer, sign) => ({
      cx: outer.x + sign * 0.26 * u,
      cy: outer.y + 0.04 * u,
      w: 0.34 * u,
      h: 0.34 * u,
    });

    // 目の下
    const underEye = (c, lid) => ({ cx: c.x, cy: lid.y + 0.16 * u, w: 0.44 * u, h: 0.20 * u });

    // 頬
    const cheek = (c, lid, sign) => ({
      cx: c.x + sign * 0.10 * u,
      cy: lid.y + 0.52 * u,
      w: 0.46 * u,
      h: 0.42 * u,
    });

    // ほうれい線: 小鼻から口角へ向かう帯（向きも合わせる）
    const fold = (wing, corner) => {
      const dx = corner.x - wing.x, dy = corner.y - wing.y;
      const len = Math.hypot(dx, dy);
      return {
        cx: (wing.x + corner.x) / 2,
        cy: (wing.y + corner.y) / 2,
        w: Math.max(len * 1.05, 0.3 * u),
        h: 0.26 * u,
        rot: Math.atan2(dy, dx),
      };
    };

    // 口元からあごへ（マリオネットライン）
    const marionette = (corner, jaw) => {
      const dx = jaw.x - corner.x, dy = jaw.y - corner.y;
      const len = Math.hypot(dx, dy);
      return {
        cx: (corner.x + jaw.x) / 2,
        cy: (corner.y + jaw.y) / 2,
        w: Math.max(len * 0.9, 0.3 * u),
        h: 0.24 * u,
        rot: Math.atan2(dy, dx),
      };
    };

    const sideA = eyeAC.x < eyeBC.x ? -1 : 1;

    return {
      forehead,
      crowA: crow(eyeAO, sideA),
      crowB: crow(eyeBO, -sideA),
      underEyeA: underEye(eyeAC, p(L.eyeABottom)),
      underEyeB: underEye(eyeBC, p(L.eyeBBottom)),
      cheekA: cheek(eyeAC, p(L.eyeABottom), sideA),
      cheekB: cheek(eyeBC, p(L.eyeBBottom), -sideA),
      foldA: fold(p(L.noseWingA), p(L.mouthA)),
      foldB: fold(p(L.noseWingB), p(L.mouthB)),
      marionetteA: marionette(p(L.mouthA), p(L.jawA)),
      marionetteB: marionette(p(L.mouthB), p(L.jawB)),
      // 目の開き・眉と目の距離は、たるみの手がかりになる
      geometry: {
        eyeOpen: (Math.abs(p(L.eyeABottom).y - p(L.eyeATop).y) + Math.abs(p(L.eyeBBottom).y - p(L.eyeBTop).y)) / 2 / u,
        browLid: (Math.abs(p(L.eyeATop).y - p(L.browA).y) + Math.abs(p(L.eyeBTop).y - p(L.browB).y)) / 2 / u,
        lowerFace: Math.abs(p(L.chin).y - (eyeAC.y + eyeBC.y) / 2) / u,
      },
    };
  }

  /* ---------------- 総合 ---------------- */

  const avg = (a, b) => {
    const xs = [a, b].filter((v) => v !== null && Number.isFinite(v));
    return xs.length ? mean(xs) : null;
  };

  /**
   * 特徴点をもとに肌を解析する。
   * @returns {object|null} analyze.js と同じ形の結果。測れなければ null
   */
  function analyzeWithLandmarks(source, landmarks, expression) {
    blurCache.clear();
    const a = alignFace(source, landmarks);
    if (!a) return null;

    let imageData = a.ctx.getImageData(0, 0, W, H);
    imageData = whiteBalance(imageData);
    const planes = toPlanes(imageData);
    const mask = buildMask(a, planes);

    let count = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
    if (count < 4000) return null;

    const r = regionsOf(a);

    // 撮影の品質を見る（解像度・ピント・明るさ）
    // scale > 1 は、元の顔が小さくて引き伸ばしていることを意味する
    const quality = checkQuality(planes, mask, a.scale);
    if (!quality.ok) return { ok: false, reason: quality.reason };

    const foreheadLine = lineDepth(planes, mask, r.forehead, 4);
    const crow = avg(lineDepth(planes, mask, r.crowA, 2), lineDepth(planes, mask, r.crowB, 2));
    const underLine = avg(lineDepth(planes, mask, r.underEyeA, 2), lineDepth(planes, mask, r.underEyeB, 2));
    const fold = avg(lineDepth(planes, mask, r.foldA, 4), lineDepth(planes, mask, r.foldB, 4));
    const mario = avg(lineDepth(planes, mask, r.marionetteA, 4), lineDepth(planes, mask, r.marionetteB, 4));
    const rough = avg(roughness(planes, mask, r.cheekA), roughness(planes, mask, r.cheekB));
    const uneven = avg(unevenness(planes, mask, r.cheekA), unevenness(planes, mask, r.cheekB));
    const yellow = avg(yellowness(planes, mask, r.cheekA), yellowness(planes, mask, r.cheekB));
    const cheekLum = avg(brightness(planes, mask, r.cheekA), brightness(planes, mask, r.cheekB));
    const underLum = avg(brightness(planes, mask, r.underEyeA), brightness(planes, mask, r.underEyeB));
    const g = r.geometry;

    const raw = { foreheadLine, crow, underLine, fold, mario, rough, uneven, yellow, cheekLum, underLum, ...g };

    // --- 表情による見かけの深まりを差し引く ---
    //
    // 笑うとほうれい線と口元の線は深くなり、目を細めると目尻に線が寄る。
    // そのぶんを割り引かないと、笑顔の写真ほど年上に出てしまう。
    // 補正は控えめにとどめ（最大でも2〜3割）、残りは注意書きで補う。
    const ex = expression || { smile: 0, squint: 0, jawOpen: 0 };
    const smile = clamp(ex.smile || 0, 0, 1);
    const squint = clamp(ex.squint || 0, 0, 1);
    const relax = (v, amount) => (v === null ? null : v * (1 - amount));

    const foldAdj = relax(fold, 0.30 * smile);
    const marioAdj = relax(mario, 0.22 * smile);
    const crowAdj = relax(crow, 0.28 * Math.max(smile, squint));
    const underAdj = relax(underLine, 0.18 * Math.max(smile, squint));
    // 目を細めていると「目の開き」が小さく出るので、たるみの判定から外す
    const eyeOpenAdj = g.eyeOpen / Math.max(0.55, 1 - 0.45 * Math.max(smile, squint));

    raw.expression = { smile, squint };
    raw.foldAdj = foldAdj;
    raw.crowAdj = crowAdj;

    // --- 0〜100 の「気になり度」に直す ---
    const nz = (v, lo, hi, dflt) => (v === null ? dflt : Math.round(ramp(v, lo, hi) * 100));

    // 各項目の下限・上限は、実際の顔写真で観測した値の幅にもとづく。
    // 合成画像で決めていたときは、実写だと軒並み振り切れてしまっていた。
    const scores = {
      // しわ: 額の横じわと、ほうれい線の深さ
      wrinkle: Math.round(
        (nz(foreheadLine, 1.4, 6.5, 30) * 0.45 + nz(foldAdj, 2.5, 11.0, 30) * 0.55)
      ),
      // 目元: 目尻の小じわと、目の下の細かい線
      eyeLine: Math.round(nz(crowAdj, 1.8, 13.0, 30) * 0.65 + nz(underAdj, 1.4, 10.0, 30) * 0.35),
      // キメ: 頬の細かい凹凸
      texture: nz(rough, 0.55, 2.9, 30),
      // ハリ: 口元からあごの線と、まぶたの下がり具合
      firmness: Math.round(
        nz(marioAdj, 1.8, 13.0, 30) * 0.6
        + (100 - nz(eyeOpenAdj, 0.14, 0.30, 50)) * 0.25
        + nz(g.browLid, 0.30, 0.60, 50) * 0.15
      ),
      // 明るさ: 黄みの強さ（照明の明暗ではなく色みで見る）
      dullness: nz(yellow, 8, 32, 40),
      // 均一さ: 照明の勾配を除いた赤みのばらつき
      evenness: nz(uneven, 1.8, 7.5, 30),
      // クマ: 目の下と頬の明るさの差
      darkCircle: (underLum === null || cheekLum === null)
        ? 30
        : Math.round(ramp((cheekLum - underLum) / Math.max(cheekLum, 1), 0.0, 0.16) * 100),
    };
    Object.keys(scores).forEach((k) => { scores[k] = clamp(scores[k], 0, 100); });

    const notes = (quality.notes || []).slice();
    // ピントは合っているのに肌の凹凸がほとんど無い＝補正のかかった写真
    if (rough !== null && rough < 0.5 && quality.sharp > 1.6) {
      notes.push("肌の質感がほとんど検出されませんでした。美肌加工やフィルターのかかった写真は、実際より若い結果になります。");
    }
    if (smile > 0.35) {
      notes.push("笑顔で写っているため、ほうれい線と目尻の線が深く出ています。ある程度は差し引いていますが、口を閉じた自然な表情だとより正確です。");
    }

    const age = estimateAge(scores, raw, smile);
    return {
      ok: true,
      age: age.value,
      ageRange: age.range,
      score: skinScore(scores),
      scores,
      raw,
      items: window.Kagami.buildItems(scores),
      notes,
      engine: "landmark",
      regions: r,
      aligned: a.canvas,
    };
  }

  /**
   * 推定年齢。
   *
   * 年齢との結びつきが強い順に重みを付けている。ほうれい線と目尻の小じわは
   * 加齢で確実に深くなるため重く、くすみや色ムラは体調・季節でも動くため軽い。
   * 幅（±）は、測定のばらつきと写真の条件から決めている。
   */
  function estimateAge(s, raw, smile) {
    const weighted =
      s.wrinkle * 0.30 +
      s.eyeLine * 0.24 +
      s.firmness * 0.20 +
      s.texture * 0.14 +
      s.dullness * 0.06 +
      s.evenness * 0.04 +
      s.darkCircle * 0.02;

    const value = clamp(Math.round(20 + (weighted / 100) * 45), 15, 79);
    // 測れなかった部位が多いほど幅を広げる
    const missing = [raw.foreheadLine, raw.crow, raw.fold, raw.mario, raw.rough]
      .filter((v) => v === null).length;
    // 表情が強いほど補正の当てが外れやすいので、幅を広げて示す
    const range = clamp(Math.round(4 + missing * 2 + (smile || 0) * 4), 4, 12);
    return { value, range };
  }

  function skinScore(s) {
    const bad =
      s.wrinkle * 0.24 + s.eyeLine * 0.18 + s.firmness * 0.16 + s.texture * 0.16 +
      s.dullness * 0.12 + s.evenness * 0.08 + s.darkCircle * 0.06;
    return clamp(Math.round(100 - bad), 0, 100);
  }

  /* ---------------- 補助（analyze.js と同等の処理） ---------------- */

  function whiteBalance(imageData) {
    const d = imageData.data;
    const n = imageData.width * imageData.height;
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0, p = 0; i < n; i++, p += 4) { sr += d[p]; sg += d[p + 1]; sb += d[p + 2]; }
    const mr = sr / n, mg = sg / n, mb = sb / n;
    const gray = (mr + mg + mb) / 3;
    if (mr < 1 || mg < 1 || mb < 1) return imageData;
    const kr = Math.pow(gray / mr, 0.6), kg = Math.pow(gray / mg, 0.6), kb = Math.pow(gray / mb, 0.6);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      d[p] = clamp(d[p] * kr, 0, 255);
      d[p + 1] = clamp(d[p + 1] * kg, 0, 255);
      d[p + 2] = clamp(d[p + 2] * kb, 0, 255);
    }
    return imageData;
  }

  function checkQuality(planes, mask, scale) {
    const detail = subtractBlur(planes.Lum, 1);
    const vals = [], lums = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      vals.push(detail[i]);
      lums.push(planes.Lum[i]);
    }
    if (vals.length < 2000) {
      return { ok: false, reason: "顔の範囲が小さすぎます。もう少し顔を大きく写してください。" };
    }
    const sharp = madSpread(vals);
    const lum = median(lums);
    const sorted = lums.slice().sort((a, b) => a - b);
    const contrast = sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)];

    if (scale > 1.35) {
      return { ok: false, reason: "顔が小さく写っています。顔が画面いっぱいになるよう、近づいて撮り直してください。" };
    }
    if (sharp < 0.7) return { ok: false, reason: "写真がぼやけています。ピントを合わせて撮り直してください。" };
    if (lum < 45) return { ok: false, reason: "写真が暗すぎます。明るい場所で撮り直してください。" };
    if (lum > 238) return { ok: false, reason: "光が強すぎて白飛びしています。直射日光や強いライトを避けてください。" };

    const notes = [];
    if (scale > 1.05) notes.push("顔がやや小さく写っています。近づいて撮ると精度が上がります。");
    if (sharp < 1.3) notes.push("ややピントが甘いため、シワの判定が弱めに出ることがあります。");
    if (contrast > 95) notes.push("影が濃く出ています。正面から光が当たる場所だとより正確です。");
    return { ok: true, notes, sharp };
  }

  window.KagamiMeasure = { analyzeWithLandmarks, W, H, IOD };
})();
