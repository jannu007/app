/* ===========================================================
   うつし鏡 — 顔年齢・肌年齢の解析エンジン

   このファイルの処理はすべてブラウザ内（端末内）で完結します。
   ネットワーク通信は一切行いません。学習済みモデルの読み込みもありません。

   考え方:
     顔写真から「シワ・キメ・ハリ・くすみ・色ムラ・クマ」に相当する
     画像特徴量を古典的な画像処理で取り出し、経験則にもとづく重み付けで
     推定年齢に換算します。医学的診断ではなく、セルフチェック用の目安です。

   同じ画像を入れれば必ず同じ結果になります（乱数を使用していません）。
   =========================================================== */
(() => {
  "use strict";

  /* ---------------- 小さなユーティリティ ---------------- */

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** 値 v を [lo, hi] の範囲で 0〜1 に正規化する（範囲外はクランプ） */
  const ramp = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

  /** 配列の平均 */
  function mean(arr) {
    if (!arr.length) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  /** 配列の標準偏差 */
  function stdev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i] - m;
      s += d * d;
    }
    return Math.sqrt(s / arr.length);
  }

  /** 昇順ソート済み配列から分位点を取る */
  function quantileSorted(sorted, q) {
    if (!sorted.length) return 0;
    const pos = clamp(q, 0, 1) * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /* ---------------- 画像の基本変換 ---------------- */

  /**
   * ImageData から輝度(L)・赤み(RG)・黄み(YB)の平面を作る。
   *  L  : 0-255 の知覚輝度
   *  RG : R - G （赤み。赤みが強いほど大きい）
   *  YB : (R + G) / 2 - B （黄み。くすみの指標に使う）
   */
  function toPlanes(imageData) {
    const { width: w, height: h, data } = imageData;
    const n = w * h;
    const L = new Float32Array(n);
    const RG = new Float32Array(n);
    const YB = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      RG[i] = r - g;
      YB[i] = (r + g) / 2 - b;
    }
    return { w, h, L, RG, YB };
  }

  /**
   * グレーワールド仮説による簡易ホワイトバランス。
   * 照明の色かぶり（電球の黄色、曇天の青など）を打ち消し、
   * 「くすみ」「色ムラ」の判定が環境光に引きずられるのを減らす。
   */
  function whiteBalance(imageData) {
    const d = imageData.data;
    const n = imageData.width * imageData.height;
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      sr += d[p]; sg += d[p + 1]; sb += d[p + 2];
    }
    const mr = sr / n, mg = sg / n, mb = sb / n;
    const gray = (mr + mg + mb) / 3;
    if (mr < 1 || mg < 1 || mb < 1) return imageData;
    // 補正量は行き過ぎないよう 0.6 の強さに抑える
    const kr = Math.pow(gray / mr, 0.6);
    const kg = Math.pow(gray / mg, 0.6);
    const kb = Math.pow(gray / mb, 0.6);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      d[p] = clamp(d[p] * kr, 0, 255);
      d[p + 1] = clamp(d[p + 1] * kg, 0, 255);
      d[p + 2] = clamp(d[p + 2] * kb, 0, 255);
    }
    return imageData;
  }

  /**
   * マスクを半径 r だけ収縮させる（分離型の最小値フィルタ）。
   *
   * 局所平均との差を取るとき、ぼかしは肌以外（背景・髪・眉・眼鏡）の画素も
   * 巻き込む。そのため肌の境界ぎわでは、シワが無くても大きな差が出てしまう。
   * ぼかし半径のぶんだけマスクを内側に削り、境界の影響を受ける画素を外す。
   */
  function erodeMask(mask, w, h, r) {
    if (r <= 0) return mask;
    const tmp = new Uint8Array(mask.length);
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let keep = 1;
        for (let dx = -r; dx <= r && keep; dx++) {
          if (!mask[y * w + clamp(x + dx, 0, w - 1)]) keep = 0;
        }
        tmp[y * w + x] = keep;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let keep = 1;
        for (let dy = -r; dy <= r && keep; dy++) {
          if (!tmp[clamp(y + dy, 0, h - 1) * w + x]) keep = 0;
        }
        out[y * w + x] = keep;
      }
    }
    return out;
  }

  /** 半径 r のボックスぼかし（横→縦の2パス。積分不要な軽量版） */
  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    const win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / win;
        sum -= src[row + clamp(x - r, 0, w - 1)];
        sum += src[row + clamp(x + r + 1, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / win;
        sum -= tmp[clamp(y - r, 0, h - 1) * w + x];
        sum += tmp[clamp(y + r + 1, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  /* ---------------- 肌色マスクと顔位置の推定 ---------------- */

  /**
   * YCbCr 空間の経験則による肌色判定。
   * 明るい肌〜濃い肌まで拾えるよう、彩度と明度の条件をゆるめに取っている。
   */
  function isSkin(r, g, b) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y < 40 || y > 250) return false;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cb < 76 || cb > 128) return false;
    if (cr < 132 || cr > 178) return false;
    if (r <= g || r <= b) return false;             // 肌は R が最も強い
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 12) return false;                  // 無彩色（壁・服）を除く
    return true;
  }

  /** 肌色マスク（0/1 の Uint8Array）を作る */
  function skinMask(imageData) {
    const { width: w, height: h, data } = imageData;
    const mask = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      mask[i] = isSkin(data[p], data[p + 1], data[p + 2]) ? 1 : 0;
    }
    return mask;
  }

  /** マスクの最大連結成分だけを残す（4近傍・幅優先探索） */
  function largestComponent(mask, w, h) {
    const label = new Int32Array(w * h).fill(-1);
    const queue = new Int32Array(w * h);
    let best = null;
    let current = 0;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || label[start] !== -1) continue;
      let head = 0, tail = 0;
      queue[tail++] = start;
      label[start] = current;
      let count = 0;
      let minX = w, maxX = -1, minY = h, maxY = -1;
      while (head < tail) {
        const idx = queue[head++];
        count++;
        const x = idx % w, y = (idx / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0 && mask[idx - 1] && label[idx - 1] === -1) { label[idx - 1] = current; queue[tail++] = idx - 1; }
        if (x < w - 1 && mask[idx + 1] && label[idx + 1] === -1) { label[idx + 1] = current; queue[tail++] = idx + 1; }
        if (y > 0 && mask[idx - w] && label[idx - w] === -1) { label[idx - w] = current; queue[tail++] = idx - w; }
        if (y < h - 1 && mask[idx + w] && label[idx + w] === -1) { label[idx + w] = current; queue[tail++] = idx + w; }
      }
      if (!best || count > best.count) best = { label: current, count, minX, maxX, minY, maxY };
      current++;
    }
    return best ? { best, label } : null;
  }

  /**
   * 顔の位置を推定する。
   * 1) 肌色の最大連結成分から大まかな矩形を得る
   * 2) 行ごとの肌色画素数から、外れ値（首・手など）を切り落とす
   * 3) 目の位置（左右対称に並ぶ暗い帯）を探して縦方向を合わせる
   *
   * 戻り値は元画像の座標系での { x, y, w, h, confidence }。
   * 見つからなければ null。
   */
  function detectFace(imageData) {
    // 検出は縮小画像で行う（速度と安定性のため）
    const scale = Math.min(1, 220 / Math.max(imageData.width, imageData.height));
    const small = scale < 1 ? resizeImageData(imageData, Math.round(imageData.width * scale), Math.round(imageData.height * scale)) : imageData;
    const w = small.width, h = small.height;

    const mask = skinMask(small);
    const comp = largestComponent(mask, w, h);
    if (!comp) return null;

    const { best, label } = comp;
    const areaRatio = best.count / (w * h);
    if (areaRatio < 0.012) return null; // 顔と呼べる大きさがない

    // 行ごとの肌色画素数から、上下の細い部分（首など）を落とす
    const rowCount = new Int32Array(h);
    const colCount = new Int32Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (label[y * w + x] === best.label) { rowCount[y]++; colCount[x]++; }
      }
    }
    const peakRow = Math.max(...rowCount);
    let top = best.minY, bottom = best.maxY;
    for (let y = best.minY; y <= best.maxY; y++) { if (rowCount[y] >= peakRow * 0.35) { top = y; break; } }
    for (let y = best.maxY; y >= best.minY; y--) { if (rowCount[y] >= peakRow * 0.35) { bottom = y; break; } }
    const peakCol = Math.max(...colCount);
    let left = best.minX, right = best.maxX;
    for (let x = best.minX; x <= best.maxX; x++) { if (colCount[x] >= peakCol * 0.3) { left = x; break; } }
    for (let x = best.maxX; x >= best.minX; x--) { if (colCount[x] >= peakCol * 0.3) { right = x; break; } }

    let bw = right - left + 1;
    let bh = bottom - top + 1;
    if (bw < 12 || bh < 12) return null;

    // 顔の縦横比はおおむね 1 : 1.32。横幅を基準に高さをそろえる
    const cx = left + bw / 2;
    const targetH = bw * 1.32;
    let cy = top + bh / 2;
    bh = targetH;

    // 目の高さを探して縦位置を微調整する（顔の各パーツの位置精度が上がる）
    const eyeY = findEyeLine(small, cx, cy, bw, bh);
    if (eyeY !== null) {
      // 標準的な顔では、目は顔の高さの 44% あたりに来る
      cy = eyeY + bh * (0.5 - 0.44);
    }

    const inv = 1 / (scale < 1 ? scale : 1);
    const box = {
      x: (cx - bw / 2) * inv,
      y: (cy - bh / 2) * inv,
      w: bw * inv,
      h: bh * inv,
    };

    // 信頼度: 面積の妥当さ・成分の埋まり具合・目が見つかったか
    const fill = best.count / (bw * bh);
    let confidence = 0.35;
    confidence += ramp(areaRatio, 0.012, 0.10) * 0.25;
    confidence += ramp(fill, 0.35, 0.75) * 0.2;
    if (eyeY !== null) confidence += 0.2;
    box.confidence = clamp(confidence, 0, 1);
    return box;
  }

  /**
   * 目の並ぶ高さを探す。
   *
   * 明るさの絶対値で「暗い画素」を決めると、照明の勾配（上が明るく下が暗い等）に
   * 引っぱられて誤った行を選んでしまう。そこで、目の大きさ程度にぼかした画像との
   * 差（＝局所的な暗さ）を使う。なだらかな明暗差はこの差にはほとんど現れない。
   *
   * そのうえで、左右対称の位置がそろって暗い行を高く評価する。
   * 片側だけの影やほくろに反応しないようにするため。
   */
  function findEyeLine(imageData, cx, cy, bw, bh) {
    const { width: w, height: h } = imageData;
    const { L } = toPlanes(imageData);
    const yFrom = Math.round(clamp(cy - bh * 0.24, 0, h - 1));
    const yTo = Math.round(clamp(cy + bh * 0.08, 0, h - 1));
    if (yTo - yFrom < 4) return null;

    const xL0 = Math.round(clamp(cx - bw * 0.44, 0, w - 1));
    const xL1 = Math.round(clamp(cx - bw * 0.12, 0, w - 1));
    const xR0 = Math.round(clamp(cx + bw * 0.12, 0, w - 1));
    const xR1 = Math.round(clamp(cx + bw * 0.44, 0, w - 1));
    if (xL1 - xL0 < 3 || xR1 - xR0 < 3) return null;

    // 目の幅と同程度にぼかし、その差分で「まわりより暗い」を測る
    const radius = Math.max(2, Math.round(bw * 0.16));
    const blur = boxBlur(L, w, h, radius);
    const diff = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) diff[i] = L[i] - blur[i];

    // しきい値は「最も暗い部分」を基準に決める。
    // 探索範囲に占める目の割合は顔の写り方で変わるため、固定の分位点で切ると
    // 肌のきれいな写真では目を拾えなくなる。深い分位点（3%）は確実に目や眉に
    // 当たるので、その半分の深さを暗さの基準にする。
    const samples = [];
    for (let y = yFrom; y <= yTo; y++) {
      for (let x = xL0; x <= xR1; x++) samples.push(diff[y * w + x]);
    }
    if (samples.length < 40) return null;
    samples.sort((a, b) => a - b);
    const deepest = quantileSorted(samples, 0.03);
    if (deepest > -6) return null; // 目と呼べるほど暗い部分がない
    const threshold = Math.min(-3, deepest * 0.5);

    let bestY = null, bestScore = 0;
    for (let y = yFrom; y <= yTo; y++) {
      let dl = 0, dr = 0;
      for (let x = xL0; x <= xL1; x++) if (diff[y * w + x] < threshold) dl++;
      for (let x = xR0; x <= xR1; x++) if (diff[y * w + x] < threshold) dr++;
      const score = Math.min(dl, dr) * 2 + (dl + dr) * 0.15;
      if (score > bestScore) { bestScore = score; bestY = y; }
    }
    if (bestY === null || bestScore < (xL1 - xL0) * 0.3) return null;
    return bestY;
  }

  /** ImageData を指定サイズに縮小/拡大する */
  function resizeImageData(imageData, w, h) {
    const src = document.createElement("canvas");
    src.width = imageData.width;
    src.height = imageData.height;
    src.getContext("2d").putImageData(imageData, 0, 0);
    const dst = document.createElement("canvas");
    dst.width = w;
    dst.height = h;
    const ctx = dst.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  /* ---------------- 撮影品質のチェック ---------------- */

  /**
   * 解析に耐える写真かどうかを判定する。
   * ピンボケ・暗すぎ・明るすぎ（白飛び）は結果が当てにならないため、
   * 結果を出す前に撮り直しを案内する。
   */
  function checkQuality(planes, mask) {
    const { w, h, L } = planes;
    const blur = boxBlur(L, w, h, 1);
    const inner = erodeMask(mask, w, h, 2);
    let detailSum = 0, count = 0;
    let lumaSum = 0, over = 0, under = 0;
    const lumas = [];
    for (let i = 0; i < L.length; i++) {
      if (!inner[i]) continue;
      const d = L[i] - blur[i];
      detailSum += d * d;
      lumaSum += L[i];
      lumas.push(L[i]);
      if (L[i] > 246) over++;
      if (L[i] < 28) under++;
      count++;
    }
    if (count < 500) {
      return { ok: false, reason: "顔の範囲が小さすぎます。もう少し顔を大きく写してください。" };
    }
    const sharpness = Math.sqrt(detailSum / count);
    const luma = lumaSum / count;
    const overRatio = over / count;
    const underRatio = under / count;
    lumas.sort((a, b) => a - b);
    const contrast = quantileSorted(lumas, 0.9) - quantileSorted(lumas, 0.1);

    if (sharpness < 1.6) {
      return { ok: false, reason: "写真がぼやけています。ピントを合わせて撮り直してください。" };
    }
    if (luma < 55) {
      return { ok: false, reason: "写真が暗すぎます。明るい場所で撮り直してください。" };
    }
    if (luma > 232 || overRatio > 0.22) {
      return { ok: false, reason: "光が強すぎて白飛びしています。直射日光や強いライトを避けてください。" };
    }
    if (contrast < 12) {
      return { ok: false, reason: "明暗の差が乏しく解析できません。正面から自然光の入る場所で撮り直してください。" };
    }

    // 解析には使えるが、精度が落ちる状態を注意として返す
    const notes = [];
    if (sharpness < 3.0) notes.push("ややピントが甘いため、シワの判定が弱めに出ることがあります。");
    if (underRatio > 0.12) notes.push("影が濃く出ています。正面から光が当たる場所だとより正確です。");
    if (luma > 205) notes.push("やや明るすぎます。光を少し弱めるとより正確です。");
    return { ok: true, sharpness, luma, contrast, notes };
  }

  /* ---------------- 領域ごとの特徴量 ---------------- */

  /**
   * 顔の切り出し画像（正規化済み）から、部位ごとの矩形を返す。
   * 値は 0〜1 の相対座標。目は y=0.44 に来るよう合わせてある。
   */
  const REGIONS = {
    forehead:  { x0: 0.28, x1: 0.72, y0: 0.12, y1: 0.30 },  // 額（横ジワ）
    // 目元は「目尻の外側」を見る。眉やまつげを含めると、
    // シワではなく毛の輪郭を線として拾ってしまうため。
    eyeL:      { x0: 0.07, x1: 0.24, y0: 0.41, y1: 0.55 },  // 左目尻
    eyeR:      { x0: 0.76, x1: 0.93, y0: 0.41, y1: 0.55 },  // 右目尻
    underEyeL: { x0: 0.20, x1: 0.40, y0: 0.50, y1: 0.58 },  // 左目の下（クマ）
    underEyeR: { x0: 0.60, x1: 0.80, y0: 0.50, y1: 0.58 },  // 右目の下
    cheekL:    { x0: 0.14, x1: 0.36, y0: 0.56, y1: 0.72 },  // 左頬（キメ・色ムラ）
    cheekR:    { x0: 0.64, x1: 0.86, y0: 0.56, y1: 0.72 },  // 右頬
    nasoL:     { x0: 0.26, x1: 0.42, y0: 0.62, y1: 0.80 },  // 左ほうれい線
    nasoR:     { x0: 0.58, x1: 0.74, y0: 0.62, y1: 0.80 },  // 右ほうれい線
    jaw:       { x0: 0.24, x1: 0.76, y0: 0.80, y1: 0.95 },  // あご・フェイスライン
  };

  /** 相対矩形を画素座標に直す */
  function rectOf(region, w, h) {
    return {
      x0: Math.round(region.x0 * w), x1: Math.round(region.x1 * w),
      y0: Math.round(region.y0 * h), y1: Math.round(region.y1 * h),
    };
  }

  /**
   * 領域内の「線」の強さを測る。
   * 局所平均との差（＝細かい凹凸）のうち、一定以上の強さを持つ画素の
   * 割合と平均振幅を組み合わせる。明るさの影響を打ち消すため、
   * 領域の平均輝度で正規化している。
   */
  function lineEnergy(planes, mask, rect, radius) {
    const { w, h, L } = planes;
    const blur = boxBlur(L, w, h, radius);
    const inner = erodeMask(mask, w, h, radius + 1);
    const vals = [];
    let lumaSum = 0;
    for (let y = rect.y0; y < rect.y1; y++) {
      if (y < 0 || y >= h) continue;
      for (let x = rect.x0; x < rect.x1; x++) {
        if (x < 0 || x >= w) continue;
        const i = y * w + x;
        if (!inner[i]) continue;
        vals.push(L[i] - blur[i]);
        lumaSum += L[i];
      }
    }
    if (vals.length < 40) return null;
    const lumaMean = lumaSum / vals.length;
    const norm = clamp(lumaMean / 140, 0.6, 1.6);
    const abs = vals.map(Math.abs);
    abs.sort((a, b) => a - b);
    // 上位10%の振幅（＝はっきりした線）を主に見る
    const strong = quantileSorted(abs, 0.9) / norm;
    const spread = stdev(vals) / norm;
    return { strong, spread, count: vals.length };
  }

  /** 領域の平均輝度・赤み・黄み・および輝度のばらつきを測る */
  function toneStats(planes, mask, rect) {
    const { w, h, L, RG, YB } = planes;
    const ls = [], rgs = [], ybs = [];
    for (let y = rect.y0; y < rect.y1; y++) {
      if (y < 0 || y >= h) continue;
      for (let x = rect.x0; x < rect.x1; x++) {
        if (x < 0 || x >= w) continue;
        const i = y * w + x;
        if (!mask[i]) continue;
        ls.push(L[i]); rgs.push(RG[i]); ybs.push(YB[i]);
      }
    }
    if (ls.length < 40) return null;
    return { luma: mean(ls), lumaSd: stdev(ls), rg: mean(rgs), yb: mean(ybs), count: ls.length };
  }

  /**
   * 顔まわりの楕円マスク。背景・髪・服を解析から外す。
   * 肌色マスクと併用して、眉やヒゲ・眼鏡の影響も部分的に取り除く。
   */
  function faceMask(imageData) {
    const { width: w, height: h } = imageData;
    const skin = skinMask(imageData);
    const mask = new Uint8Array(w * h);
    const cx = w / 2, cy = h * 0.52;
    const rx = w * 0.46, ry = h * 0.46;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const i = y * w + x;
          mask[i] = skin[i];
        }
      }
    }
    return mask;
  }

  /* ---------------- スコアリング ---------------- */

  /**
   * 各特徴量を 0〜100 の「気になり度」に変換する。
   * 0 に近いほど良好、100 に近いほど年齢的な変化が目立つ状態。
   * しきい値は、正規化した 256px 幅の顔画像を前提とした経験値。
   */
  function scoreAll(planes, mask) {
    const { w, h } = planes;
    const R = (key) => rectOf(REGIONS[key], w, h);

    // --- 額の横ジワ ---
    const fore = lineEnergy(planes, mask, R("forehead"), 3);
    // --- 目尻の小ジワ（左右の平均） ---
    const eyeL = lineEnergy(planes, mask, R("eyeL"), 2);
    const eyeR = lineEnergy(planes, mask, R("eyeR"), 2);
    // --- ほうれい線 ---
    const nasoL = lineEnergy(planes, mask, R("nasoL"), 3);
    const nasoR = lineEnergy(planes, mask, R("nasoR"), 3);
    // --- 頬のキメ（細かい凹凸） ---
    const cheekTexL = lineEnergy(planes, mask, R("cheekL"), 1);
    const cheekTexR = lineEnergy(planes, mask, R("cheekR"), 1);
    // --- 色味 ---
    const cheekToneL = toneStats(planes, mask, R("cheekL"));
    const cheekToneR = toneStats(planes, mask, R("cheekR"));
    const underL = toneStats(planes, mask, R("underEyeL"));
    const underR = toneStats(planes, mask, R("underEyeR"));
    const jawLine = lineEnergy(planes, mask, R("jaw"), 3);
    const jawTone = toneStats(planes, mask, R("jaw"));
    const foreTone = toneStats(planes, mask, R("forehead"));

    const avg = (a, b, pick) => {
      const xs = [a, b].filter(Boolean).map(pick);
      return xs.length ? mean(xs) : null;
    };

    // 顔全体の基準となる明るさ（頬＋額）
    const baseLuma = mean([cheekToneL, cheekToneR, foreTone].filter(Boolean).map((t) => t.luma)) || 150;

    /* シワ（額・ほうれい線・あご） */
    const foreStrong = fore ? fore.strong : null;
    const nasoStrong = avg(nasoL, nasoR, (v) => v.strong);
    const wrinkleRaw = mean([foreStrong, nasoStrong].filter((v) => v !== null));
    const wrinkle = Math.round(ramp(wrinkleRaw, 3.0, 13.0) * 100);

    /* 目元（小ジワ） */
    const eyeStrong = avg(eyeL, eyeR, (v) => v.strong);
    const eyeLine = Math.round(ramp(eyeStrong === null ? 4 : eyeStrong, 3.2, 12.0) * 100);

    /* キメ（頬の細かさ）— 細かい凹凸が大きいほどキメが粗い */
    const texRaw = avg(cheekTexL, cheekTexR, (v) => v.spread);
    const texture = Math.round(ramp(texRaw === null ? 2 : texRaw, 1.3, 5.5) * 100);

    /* ハリ・たるみ — フェイスラインに現れる線と影の強さ */
    const jawRaw = jawLine ? jawLine.strong : null;
    const jawShadow = jawTone && baseLuma ? clamp((baseLuma - jawTone.luma) / baseLuma, 0, 1) : 0;
    const firmness = Math.round(
      clamp(ramp(jawRaw === null ? 4 : jawRaw, 3.0, 11.0) * 0.65 + ramp(jawShadow, 0.02, 0.30) * 0.35, 0, 1) * 100
    );

    /* くすみ — 暗さと黄みの強さ */
    const cheekYb = avg(cheekToneL, cheekToneR, (v) => v.yb);
    const dullness = Math.round(
      clamp(ramp(180 - baseLuma, 10, 90) * 0.55 + ramp(cheekYb === null ? 30 : cheekYb, 24, 62) * 0.45, 0, 1) * 100
    );

    /* 色ムラ — 頬の中での明暗・赤みのばらつき */
    const cheekSd = avg(cheekToneL, cheekToneR, (v) => v.lumaSd);
    const evenness = Math.round(ramp(cheekSd === null ? 8 : cheekSd, 6.0, 22.0) * 100);

    /* クマ — 目の下と頬の明るさの差 */
    const underLuma = avg(underL, underR, (v) => v.luma);
    const cheekLuma = avg(cheekToneL, cheekToneR, (v) => v.luma);
    const darkCircle = (underLuma === null || cheekLuma === null)
      ? 30
      : Math.round(ramp((cheekLuma - underLuma) / Math.max(cheekLuma, 1), 0.0, 0.22) * 100);

    const raw = {
      foreStrong, nasoStrong, eyeStrong, texRaw, jawRaw, jawShadow,
      cheekYb, cheekSd, baseLuma, underLuma, cheekLuma,
    };

    return { raw, scores: {
      wrinkle: clamp(wrinkle, 0, 100),
      eyeLine: clamp(eyeLine, 0, 100),
      texture: clamp(texture, 0, 100),
      firmness: clamp(firmness, 0, 100),
      dullness: clamp(dullness, 0, 100),
      evenness: clamp(evenness, 0, 100),
      darkCircle: clamp(darkCircle, 0, 100),
    } };
  }

  /**
   * 各スコアから推定年齢を出す。
   * シワ・ほうれい線・目元は年齢との相関が強いため重みを大きく、
   * くすみ・色ムラは体調や環境で動きやすいため重みを小さくしている。
   */
  function estimateAge(s) {
    const weighted =
      s.wrinkle * 0.26 +
      s.eyeLine * 0.22 +
      s.firmness * 0.18 +
      s.texture * 0.14 +
      s.dullness * 0.10 +
      s.evenness * 0.06 +
      s.darkCircle * 0.04;
    const age = 19 + (weighted / 100) * 48;
    return clamp(Math.round(age), 15, 79);
  }

  /** 総合の肌スコア（100点満点、高いほど良好） */
  function skinScore(s) {
    const bad =
      s.wrinkle * 0.24 +
      s.eyeLine * 0.18 +
      s.firmness * 0.16 +
      s.texture * 0.16 +
      s.dullness * 0.12 +
      s.evenness * 0.08 +
      s.darkCircle * 0.06;
    return clamp(Math.round(100 - bad), 0, 100);
  }

  /* ---------------- 項目の説明とアドバイス ---------------- */

  const ITEMS = [
    {
      key: "wrinkle", label: "シワ", hint: "額・ほうれい線のはっきりさ",
      good: "額もほうれい線も目立たず、なめらかな状態です。",
      mid: "表情のクセに沿った線が少し出はじめています。",
      bad: "額やほうれい線がはっきり出ています。乾燥が進むと定着しやすくなります。",
      care: "保湿クリームで水分を抱えこませ、洗顔後すぐのケアを習慣にすると線が浅く見えます。",
    },
    {
      key: "eyeLine", label: "目元", hint: "目尻の小ジワの多さ",
      good: "目尻はなめらかで、小ジワはほとんど見られません。",
      mid: "目尻に細かい線が見えはじめています。乾燥のサインです。",
      bad: "目尻の小ジワが目立ちます。皮膚が薄い部分なので変化が出やすい場所です。",
      care: "目元は皮膚が薄いので、専用のアイクリームをやさしく置くように塗るのが向いています。",
    },
    {
      key: "texture", label: "キメ", hint: "頬の肌の細かさ・なめらかさ",
      good: "キメが整い、表面がなめらかです。",
      mid: "キメがやや粗くなり、毛穴が開き気味です。",
      bad: "キメの乱れが目立ち、ざらつきや毛穴の開きが出ています。",
      care: "こすらない洗顔と、週1〜2回の角質ケア。摩擦を減らすだけでも整いやすくなります。",
    },
    {
      key: "firmness", label: "ハリ", hint: "フェイスラインの引き締まり",
      good: "フェイスラインが締まっていて、ハリのある状態です。",
      mid: "あご下の輪郭がややゆるみはじめています。",
      bad: "フェイスラインのゆるみが目立ちます。むくみが重なっている可能性もあります。",
      care: "姿勢と咀嚼、そして睡眠。塩分を控えるとむくみが引いて輪郭が戻ることも多いです。",
    },
    {
      key: "dullness", label: "明るさ", hint: "肌のくすみ・血色",
      good: "肌が明るく、血色のよい状態です。",
      mid: "少しくすみが出ています。疲れや紫外線の影響かもしれません。",
      bad: "くすみが強く、肌が暗く沈んで見えます。",
      care: "紫外線対策と睡眠が最短の近道です。日中の日焼け止めを習慣にしてみてください。",
    },
    {
      key: "evenness", label: "均一さ", hint: "頬の色ムラ・シミの散らばり",
      good: "色ムラが少なく、均一な肌色です。",
      mid: "部分的に色の差が出ています。",
      bad: "色ムラやシミの散らばりが目立ちます。",
      care: "紫外線の蓄積が主な原因です。曇りの日でも日焼け止めを塗ると進みにくくなります。",
    },
    {
      key: "darkCircle", label: "クマ", hint: "目の下の暗さ",
      good: "目の下の暗さはほとんどありません。",
      mid: "目の下がやや暗くなっています。",
      bad: "目の下のクマがはっきり出ています。睡眠不足や血行の停滞が考えられます。",
      care: "睡眠時間の確保と、目元をあたためる習慣。血行が戻ると印象が大きく変わります。",
    },
  ];

  /** スコアから講評とアドバイスの一覧を作る */
  function buildItems(scores) {
    return ITEMS.map((it) => {
      const v = scores[it.key];
      const level = v < 34 ? "good" : v < 67 ? "mid" : "bad";
      return {
        key: it.key,
        label: it.label,
        hint: it.hint,
        value: v,
        rating: clamp(Math.round(100 - v), 0, 100), // 表示は「良いほど高い」に反転
        level,
        comment: it[level],
        care: level === "good" ? "この調子を保てています。今のケアを続けてください。" : it.care,
      };
    });
  }

  /** 総合講評（肌スコアと最も気になる項目から生成） */
  function overallComment(score, items) {
    const worst = items.slice().sort((a, b) => b.value - a.value)[0];
    let head;
    if (score >= 82) head = "とても良い状態です。";
    else if (score >= 68) head = "全体としては good な状態です。";
    else if (score >= 52) head = "標準的な状態です。";
    else if (score >= 36) head = "少しお疲れぎみの肌です。";
    else head = "肌が休息を求めているようです。";
    return `${head}いま最も気になるのは「${worst.label}」（${worst.hint}）です。${worst.care}`;
  }

  /* ---------------- 公開API ---------------- */

  /**
   * 顔画像を解析する。
   * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} source 元画像
   * @param {{x:number,y:number,w:number,h:number}} box 顔の範囲（元画像の座標系）
   * @returns {{ok:boolean, reason?:string, age?:number, score?:number, items?:Array, notes?:Array}}
   */
  function analyze(source, box) {
    // 顔の範囲を 256 x 338 に正規化して切り出す
    const W = 256, H = 338;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, W, H);

    let imageData = ctx.getImageData(0, 0, W, H);
    imageData = whiteBalance(imageData);

    const mask = faceMask(imageData);
    const planes = toPlanes(imageData);

    const quality = checkQuality(planes, mask);
    if (!quality.ok) return { ok: false, reason: quality.reason };

    const { scores, raw } = scoreAll(planes, mask);
    const age = estimateAge(scores);
    const score = skinScore(scores);
    const items = buildItems(scores);

    return {
      ok: true,
      age,
      score,
      items,
      scores,
      raw,
      notes: quality.notes || [],
      quality: { sharpness: quality.sharpness, luma: quality.luma, contrast: quality.contrast },
    };
  }

  window.Kagami = { detectFace, analyze, resizeImageData, REGIONS, buildItems };
})();
