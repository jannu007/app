/* ===========================================================
   つみたての桜 — 新NISAシミュレーター
   複利計算・桜の木モーショングラフィックス・成長グラフ
   すべて端末内で計算されます（サーバー送信なし）。
   =========================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "tsumitate-niwa:v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmtYen = (n) => Math.round(n).toLocaleString("ja-JP");
  const fmtMan = (n) => Math.round(n / 10000) + "万円";
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function lerpColorArr(c1, c2, t) {
    return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  }
  function toRgb(c) {
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 状態 ---------------- */
  const DEFAULTS = { tsumitateMonthly: 30000, growthMonthly: 0, lumpsum: 0, rate: 5, years: 20 };
  let state = { ...DEFAULTS };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 旧バージョン（毎月の積立額が単一だった頃）のデータからの移行
        let tsumitateMonthly = parsed.tsumitateMonthly;
        let growthMonthly = parsed.growthMonthly;
        if (tsumitateMonthly === undefined && typeof parsed.monthly === "number") {
          tsumitateMonthly = Math.min(parsed.monthly, 100000);
          growthMonthly = Math.max(0, parsed.monthly - 100000);
        }
        state = {
          tsumitateMonthly: clamp(Number(tsumitateMonthly) || 0, 0, 100000),
          growthMonthly: clamp(Number(growthMonthly) || 0, 0, 200000),
          lumpsum: clamp(Number(parsed.lumpsum) || 0, 0, 5000000),
          rate: clamp(Number(parsed.rate) || DEFAULTS.rate, 0.1, 15),
          years: clamp(Number(parsed.years) || DEFAULTS.years, 1, 40),
        };
      }
    } catch (e) { /* 無視して初期値を使用 */ }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境では無視 */ }
  }

  /* ---------------- リアルタイム相場（任意・端末から外部データ源へ直接通信） ---------------- */
  const REALTIME_KEY = "tsumitate-niwa:realtime:v1";
  const FUND_LABELS = { acwi: "オルカン（全世界株式）", sp500: "S&P500" };
  // 銘柄ごとに複数の取得元を用意し、上から順に試す（通信環境によりCORSが通らない場合があるため）
  const FUND_SOURCES = {
    acwi: [
      { provider: "stooq", symbol: "2559.jp" },
      { provider: "yahoo", symbol: "2559.T" },
    ],
    sp500: [
      { provider: "stooq", symbol: "^spx" },
      { provider: "yahoo", symbol: "^GSPC" },
    ],
  };
  // 外部サイトへの通信が使えない環境でも必ず何か表示できるよう、長期の歴史的平均を参考値として同梱しておく
  // （API取得に成功した場合はそちらを優先し、失敗した場合のみこの参考値にフォールバックする）
  const STATIC_FUND_REFERENCE = {
    acwi: { rate: 8.0, fallback: true },
    sp500: { rate: 10.0, fallback: true },
  };
  let realtime = { enabled: false, funds: {}, selected: null, fetchedAt: 0 };

  function loadRealtime() {
    try {
      const raw = localStorage.getItem(REALTIME_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        realtime = {
          enabled: !!parsed.enabled,
          funds: parsed.funds && typeof parsed.funds === "object" ? parsed.funds : {},
          selected: parsed.selected || null,
          fetchedAt: Number(parsed.fetchedAt) || 0,
        };
      }
    } catch (e) { /* 無視して初期値を使用 */ }
  }
  function saveRealtime() {
    try { localStorage.setItem(REALTIME_KEY, JSON.stringify(realtime)); } catch (e) { /* 保存できない環境では無視 */ }
  }

  function parseStooqCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 3) throw new Error("データが不足しています");
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 5) continue;
      const date = parts[0];
      const close = Number(parts[4]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue;
      rows.push({ date, close });
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (rows.length < 2) throw new Error("有効なデータがありません");
    return rows;
  }

  // データ元の欠損・異常値（特に「当月分」の未確定な最終行が極端な値になるケース）を取り除く
  function sanitizeSeries(rows) {
    if (rows.length < 2) return rows;
    const cleaned = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
      const prev = cleaned[cleaned.length - 1];
      const cur = rows[i];
      const ratio = cur.close / prev.close;
      if (ratio < 0.4 || ratio > 3) continue; // 1か月でこれ以上動くのは通常ありえないため異常値とみなす
      cleaned.push(cur);
    }
    if (cleaned.length < 2) return rows;
    // 今月分はまだ月の途中でデータが確定していないため、集計対象から外す
    const now = new Date();
    const last = new Date(cleaned[cleaned.length - 1].date);
    if (cleaned.length > 2 && last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth()) {
      cleaned.pop();
    }
    return cleaned;
  }

  function computeCagr(rows) {
    const clean = sanitizeSeries(rows);
    const first = clean[0], last = clean[clean.length - 1];
    const years = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24 * 365.25);
    if (!(years > 0.5)) throw new Error("期間が短すぎます");
    const rate = (Math.pow(last.close / first.close, 1 / years) - 1) * 100;
    return { rate, years, asOf: last.date, series: clean };
  }

  function parseYahooChart(json) {
    const result = json && json.chart && json.chart.result && json.chart.result[0];
    if (!result || !result.timestamp) throw new Error("yahoo: invalid response");
    const ts = result.timestamp;
    const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
    const closes = quote && quote.close;
    if (!closes) throw new Error("yahoo: no series");
    const rows = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && c > 0) {
        rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
      }
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (rows.length < 2) throw new Error("yahoo: insufficient data");
    return rows;
  }

  const stooqUrl = (symbol) => `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=m`;
  const yahooUrl = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo`;
  const viaProxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  async function fetchOne(provider, symbol, useProxy) {
    const rawUrl = provider === "stooq" ? stooqUrl(symbol) : yahooUrl(symbol);
    const url = useProxy ? viaProxy(rawUrl) : rawUrl;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${provider} http ${res.status}`);
    if (provider === "stooq") {
      const text = await res.text();
      return computeCagr(parseStooqCsv(text));
    }
    const json = await res.json();
    return computeCagr(parseYahooChart(json));
  }

  // 取得元を順番に試し、最初に成功したものを採用する（一つの通信経路がブロックされていても他で補う）。
  // すべて失敗した場合も、通信不要の参考値（長期の歴史的平均）にフォールバックし、必ず何かを表示する。
  async function fetchFundReturn(fund) {
    for (const src of FUND_SOURCES[fund]) {
      for (const useProxy of [false, true]) {
        try {
          return await fetchOne(src.provider, src.symbol, useProxy);
        } catch (e) {
          console.warn(`[つみたての桜] ${fund} の取得に失敗 (${src.provider}${useProxy ? "/proxy" : ""}):`, e);
        }
      }
    }
    return { ...STATIC_FUND_REFERENCE[fund] };
  }

  function fundMetaText(info) {
    if (info.fallback) return "長期の歴史的平均（参考値）";
    const label = info.years >= 4.5 ? `直近${Math.round(info.years)}年` : `設定来 約${info.years.toFixed(1)}年`;
    return `${label}年率・${info.asOf}時点`;
  }
  function setFundLoading(fund) {
    const card = $(`.fund-card[data-fund="${fund}"]`);
    card.disabled = true;
    card.classList.remove("active", "error");
    $(`#${fund}Rate`).textContent = "…";
    $(`#${fund}Meta`).textContent = "取得中…";
  }
  function setFundError(fund) {
    const card = $(`.fund-card[data-fund="${fund}"]`);
    card.disabled = true;
    card.classList.add("error");
    card.classList.remove("active");
    $(`#${fund}Rate`).textContent = "--";
    $(`#${fund}Meta`).textContent = "取得できませんでした";
  }
  function setFundData(fund, info) {
    const card = $(`.fund-card[data-fund="${fund}"]`);
    card.disabled = false;
    card.classList.remove("error");
    card.classList.toggle("fallback", !!info.fallback);
    $(`#${fund}Rate`).textContent = `${info.rate >= 0 ? "+" : ""}${info.rate.toFixed(1)}%`;
    $(`#${fund}Meta`).textContent = fundMetaText(info);
  }
  function renderFundCard(fund) {
    const info = realtime.funds[fund];
    if (info && !info.error) setFundData(fund, info);
    else if (info && info.error) setFundError(fund);
    else setFundLoading(fund);
    $(`.fund-card[data-fund="${fund}"]`).classList.toggle("active", realtime.selected === fund && !!info && !info.error);
  }

  /* ---------------- 選択した銘柄の推移グラフ ---------------- */
  const FUND_TREND_W = 600, FUND_TREND_H = 180;
  const FUND_LINE_COLOR = { acwi: "#5e8c7a", sp500: "#3a5282" };
  let fundTrendCtx = null;

  // 参考値（実データなし）の場合に、その年率で複利運用したと仮定した試算カーブを作る
  function buildIllustrativeSeries(rate, years = 10) {
    const months = years * 12;
    const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
    const values = [];
    let v = 100;
    for (let m = 0; m <= months; m++) { values.push(v); v *= 1 + monthlyRate; }
    return values;
  }

  function drawFundTrendChart(fund) {
    const wrap = $("#fundTrend");
    if (!fundTrendCtx || !fund) { wrap.hidden = true; return; }
    const info = realtime.funds[fund];
    if (!info || info.error) { wrap.hidden = true; return; }
    wrap.hidden = false;

    const hasSeries = info.series && info.series.length >= 2;
    let values, firstLabel, lastLabel, hintText;
    if (hasSeries) {
      const series = info.series;
      const base = series[0].close;
      values = series.map((r) => (r.close / base) * 100);
      firstLabel = series[0].date;
      lastLabel = series[series.length - 1].date;
      hintText = `${FUND_LABELS[fund]}の推移（開始時点を100として指数化）。${firstLabel} 〜 ${lastLabel}`;
    } else {
      // 実データが取得できず参考値を使っている場合も、必ず何かのグラフを表示する
      values = buildIllustrativeSeries(info.rate);
      firstLabel = "0年目";
      lastLabel = "10年目";
      hintText = `${FUND_LABELS[fund]}の参考年率（${info.rate >= 0 ? "+" : ""}${info.rate.toFixed(1)}%）で複利運用したと仮定した試算カーブです。実際の値動きではありません。`;
    }

    const minV = Math.min(...values, 100), maxV = Math.max(...values, 100);
    const range = Math.max(1, maxV - minV);
    const padL = 40, padR = 10, padT = 12, padB = 20;
    const plotW = FUND_TREND_W - padL - padR, plotH = FUND_TREND_H - padT - padB;
    const x = (i) => padL + (i / (values.length - 1)) * plotW;
    const y = (v) => padT + plotH - ((v - minV) / range) * plotH;

    const ctx = fundTrendCtx;
    ctx.clearRect(0, 0, FUND_TREND_W, FUND_TREND_H);
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    [minV, 100, maxV].forEach((v) => {
      const gy = y(v);
      ctx.strokeStyle = v === 100 ? "rgba(176,58,46,0.35)" : "rgba(120,100,70,0.16)";
      ctx.setLineDash(v === 100 ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(96,82,72,0.75)";
      ctx.fillText(v.toFixed(0), padL - 6, gy + 3);
    });

    ctx.beginPath();
    values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.strokeStyle = FUND_LINE_COLOR[fund] || "#3a5282";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    if (!hasSeries) ctx.setLineDash([5, 4]); // 試算カーブは点線で区別する
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(96,82,72,0.75)";
    ctx.textAlign = "left";
    ctx.fillText(firstLabel, padL, FUND_TREND_H - 4);
    ctx.textAlign = "right";
    ctx.fillText(lastLabel, padL + plotW, FUND_TREND_H - 4);

    $("#fundTrendHint").textContent = hintText;
  }

  async function refreshRealtimeData() {
    const btn = $("#realtimeRefresh");
    btn.disabled = true;
    Object.keys(FUND_SOURCES).forEach(setFundLoading);
    let fallbackUsed = false;
    await Promise.all(
      Object.keys(FUND_SOURCES).map(async (fund) => {
        try {
          const info = await fetchFundReturn(fund);
          if (info.fallback) fallbackUsed = true;
          realtime.funds[fund] = info;
          setFundData(fund, info);
        } catch (e) {
          realtime.funds[fund] = { error: true };
          setFundError(fund);
        }
      })
    );
    realtime.fetchedAt = Date.now();
    saveRealtime();
    btn.disabled = false;
    if (realtime.selected) {
      renderFundCard(realtime.selected);
      drawFundTrendChart(realtime.selected);
    }
    if (fallbackUsed) toast("通信できなかったため、一部は長期の歴史的平均（参考値）を表示しています");
  }

  function clearFundSelection() {
    if (!realtime.selected) return;
    realtime.selected = null;
    saveRealtime();
    $$(".fund-card").forEach((c) => c.classList.remove("active"));
    $("#fundTrend").hidden = true;
  }

  /* ---------------- 複利シミュレーション ---------------- */
  function compute(s) {
    const monthly = s.tsumitateMonthly + s.growthMonthly;
    const months = Math.round(s.years * 12);
    const i = s.rate / 100 / 12;
    let balance = s.lumpsum;
    let principal = s.lumpsum;
    const yearly = [{ year: 0, principal, balance }];
    for (let m = 1; m <= months; m++) {
      balance = (balance + monthly) * (1 + i);
      principal += monthly;
      if (m % 12 === 0) yearly.push({ year: m / 12, principal, balance });
    }
    return { principal, balance, profit: balance - principal, yearly };
  }

  /* ---------------- カウントアップ数字 ---------------- */
  function animateNumber(el, to) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = to;
    el.textContent = fmtYen(to); // 即時に正しい値を表示（アニメーションが動かない環境でも表示は保証する）
    cancelAnimationFrame(el._raf);
    if (REDUCED || from === to) return;
    const duration = 500;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmtYen(lerp(from, to, eased));
      if (t < 1) el._raf = requestAnimationFrame(step);
      else el.textContent = fmtYen(to);
    }
    el._raf = requestAnimationFrame(step);
  }

  /* ---------------- 桜の木の骨格（シード固定でランダム生成） ---------------- */
  const MAX_DEPTH = 6;
  const rng = mulberry32(2024);
  function buildNode(depth) {
    const node = { depth, children: [], leafSeed: rng() };
    if (depth >= MAX_DEPTH) return node;
    const nChildren = depth === 0 ? 1 : (rng() < 0.4 ? 3 : 2);
    const angles = nChildren === 1 ? [0] : nChildren === 2 ? [-1, 1] : [-1, 0, 1];
    for (let k = 0; k < nChildren; k++) {
      const child = buildNode(depth + 1);
      child.angle = angles[k] * (0.42 + rng() * 0.24) + (rng() - 0.5) * 0.1;
      child.lenRatio = 0.68 + rng() * 0.15;
      node.children.push(child);
    }
    return node;
  }
  const treeSkeleton = buildNode(0);

  const MATCHA = [94, 140, 122];
  const GOLD = [196, 149, 63];
  const SAKURA = [237, 174, 190];
  const SAKURA_DEEP = [214, 132, 148];
  const INK = "rgb(58,46,40)";
  const TREE_W = 600, TREE_H = 560;
  const GROUND_Y = 500, BASE_LEN = 78;
  const BLOOM_TARGET = 100000000; // 評価額1億円で満開

  let treeCurrent = { scale: 0.12, depthF: 0.6, leafDensity: 0.35, goldRatio: 0, bloomRatio: 0 };
  let treeTarget = { scale: 0.5, depthF: 2, leafDensity: 0.5, goldRatio: 0, bloomRatio: 0 };
  let hasBloomed = false;
  let assetProgress = 0; // 評価額の進み具合（0〜1）。背景の花びらの数にも使う

  function updateTreeTarget(result) {
    const profitRatio = result.principal > 0 ? result.profit / result.principal : 0;
    const progress = clamp(result.balance / BLOOM_TARGET, 0, 1); // 評価額そのもので木の育ち具合を決める
    assetProgress = progress;
    treeTarget = {
      scale: clamp(0.22 + progress * 1.65, 0.22, 1.87), // 満開時は画面いっぱいに育つ大きさにする
      depthF: clamp(1.3 + progress * (MAX_DEPTH + 0.7 - 1.3), 1.3, MAX_DEPTH + 0.7),
      leafDensity: clamp(0.35 + progress * 1.8 + profitRatio * 0.3, 0.35, 3.2),
      goldRatio: clamp(profitRatio / 2.2, 0, 1),
      bloomRatio: clamp((progress - 0.7) / 0.3, 0, 1), // 1億円に近づくと桜色へ
    };
    if (progress >= 1 && !hasBloomed) {
      hasBloomed = true;
      toast("🌸 資産の桜が満開になりました！");
      for (let i = 0; i < 22; i++) spawnSparkle(true);
    } else if (progress < 1) {
      hasBloomed = false;
    }
  }

  function drawGround(ctx) {
    const cx = TREE_W / 2;

    // 幹の足元の柔らかい影
    ctx.fillStyle = "rgba(58,46,40,0.12)";
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 10, 118, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // なだらかに波打つ地面（芝）
    ctx.fillStyle = "#8aab72";
    ctx.beginPath();
    ctx.moveTo(0, TREE_H);
    ctx.lineTo(0, GROUND_Y + 6);
    for (let gx = 0; gx <= TREE_W; gx += 15) {
      ctx.lineTo(gx, GROUND_Y + Math.sin(gx * 0.045 + 1.2) * 4);
    }
    ctx.lineTo(TREE_W, TREE_H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#728f5c";
    ctx.beginPath();
    ctx.moveTo(0, TREE_H);
    ctx.lineTo(0, GROUND_Y + 12);
    for (let gx = 0; gx <= TREE_W; gx += 15) {
      ctx.lineTo(gx, GROUND_Y + 8 + Math.sin(gx * 0.045 + 1.2) * 4);
    }
    ctx.lineTo(TREE_W, TREE_H);
    ctx.closePath();
    ctx.fill();

    // 幹のまわりの小さな草
    ctx.strokeStyle = "#5e8c4a";
    ctx.lineCap = "round";
    for (let i = -6; i <= 6; i++) {
      const gx = cx + i * 13 + (i % 2 === 0 ? 4 : -3);
      const gy = GROUND_Y + Math.sin(gx * 0.045 + 1.2) * 4 + 2;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + (i % 2 === 0 ? 3 : -3), gy - 8, gx + (i % 2 === 0 ? 1 : -1), gy - 13);
      ctx.stroke();
    }

    // 足元に舞い落ちた桜の花びら
    ctx.fillStyle = "#edaebe";
    [[-70, 6, 0.5], [-24, 12, -0.3], [40, 4, 0.8], [86, 10, -0.6]].forEach(([ox, oy, rot]) => {
      const gx = cx + ox, gy = GROUND_Y + oy + Math.sin(gx * 0.045 + 1.2) * 4;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawFoliage(ctx, x, y, node, params, grown) {
    const r = (MAX_DEPTH - node.depth + 1.4) * 3.1 * params.scale * clamp(params.leafDensity, 0.3, 2.8) * grown;
    if (r < 1.2) return;
    const bloom = clamp(params.bloomRatio, 0, 1);
    const goldMix = lerpColorArr(MATCHA, GOLD, clamp(params.goldRatio, 0, 1) * (0.5 + node.leafSeed * 0.5));
    const finalColor = toRgb(lerpColorArr(goldMix, SAKURA, bloom));
    ctx.globalAlpha = 0.88 * grown;
    ctx.fillStyle = finalColor;
    const dotCount = 3 + Math.round(bloom * 3); // 満開に近づくほど花房が増える
    for (let k = 0; k < dotCount; k++) {
      const ang = node.leafSeed * Math.PI * 2 + (k * Math.PI * 2) / dotCount;
      const ox = Math.cos(ang) * r * 0.42, oy = Math.sin(ang) * r * 0.42;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r * (0.5 + bloom * 0.12), 0, Math.PI * 2);
      ctx.fill();
      if (bloom > 0.55) {
        // 花芯（花びらの中心の濃い点）
        ctx.globalAlpha = 0.85 * grown;
        ctx.fillStyle = toRgb(SAKURA_DEEP);
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = finalColor;
        ctx.globalAlpha = 0.88 * grown;
      }
    }
    ctx.globalAlpha = 1;
    if (bloom < 0.5 && node.leafSeed < params.goldRatio * 0.55) {
      const cr = clamp(2.4 * params.scale * grown, 0, 5);
      ctx.fillStyle = "#c4953f";
      ctx.strokeStyle = "#8a6530";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.25, cr, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }

  function walk(ctx, node, x, y, angle, len, params, now) {
    const grown = clamp(params.depthF - node.depth, 0, 1);
    if (grown <= 0.004) return;
    const sway = REDUCED ? 0 : Math.sin(now / 1000 * (0.6 + node.depth * 0.15) + node.leafSeed * 10) * (0.02 + node.depth * 0.01);
    const drawAngle = angle + sway;
    const segLen = len * grown;
    const nx = x + Math.cos(drawAngle) * segLen;
    const ny = y + Math.sin(drawAngle) * segLen;
    ctx.lineWidth = Math.max(1.1, (MAX_DEPTH - node.depth + 1) * 1.5 * params.scale);
    ctx.strokeStyle = INK;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();

    if (node.depth >= MAX_DEPTH - 2) drawFoliage(ctx, nx, ny, node, params, grown);

    for (const child of node.children) {
      walk(ctx, child, nx, ny, drawAngle + child.angle, len * child.lenRatio, params, now);
    }
  }

  let sparkles = [];
  function spawnSparkle(forcePink) {
    const pink = forcePink || Math.random() < treeCurrent.bloomRatio;
    sparkles.push({
      x: TREE_W / 2 + (Math.random() - 0.5) * 190 * treeCurrent.scale,
      y: GROUND_Y - 90 * treeCurrent.scale - Math.random() * 100 * treeCurrent.scale,
      vy: -0.22 - Math.random() * 0.28,
      vx: (Math.random() - 0.5) * 0.14,
      life: 0,
      maxLife: 70 + Math.random() * 50,
      size: 1.3 + Math.random() * (pink ? 2.4 : 1.7),
      pink,
    });
  }
  function updateSparkles(ctx, now) {
    if (!REDUCED && Math.random() < 0.015 + treeCurrent.leafDensity * 0.015) spawnSparkle(false);
    sparkles = sparkles.filter((p) => p.life < p.maxLife);
    for (const p of sparkles) {
      p.life++; p.x += p.vx; p.y += p.vy;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.sin(Math.PI * t) * 0.9);
      ctx.fillStyle = p.pink ? "#edaebe" : "#d6b26c";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let treeCtx = null;
  function drawTree(now) {
    if (!treeCtx) return;
    treeCtx.clearRect(0, 0, TREE_W, TREE_H);
    drawGround(treeCtx);
    walk(treeCtx, treeSkeleton, TREE_W / 2, GROUND_Y, -Math.PI / 2, BASE_LEN * treeCurrent.scale, treeCurrent, now);
    updateSparkles(treeCtx, now);
  }

  /* ---------------- 成長グラフ ---------------- */
  const CHART_W = 600, CHART_H = 280;
  let chartCtx = null;
  let chartData = [{ year: 0, principal: 0, balance: 0 }];
  let chartAnimStart = 0;

  function updateChartTarget(result) {
    chartData = result.yearly;
    chartAnimStart = performance.now();
  }

  function drawChartFrame(data, revealT) {
    if (!chartCtx || data.length < 2) return;
    const ctx = chartCtx;
    ctx.clearRect(0, 0, CHART_W, CHART_H);
    const padL = 58, padR = 12, padT = 14, padB = 26;
    const plotW = CHART_W - padL - padR, plotH = CHART_H - padT - padB;
    const maxVal = Math.max(1, ...data.map((d) => d.balance)) * 1.12;
    const x = (i) => padL + (i / (data.length - 1)) * plotW;
    const y = (v) => padT + plotH - (v / maxVal) * plotH;

    ctx.strokeStyle = "rgba(120,100,70,0.16)";
    ctx.fillStyle = "rgba(96,82,72,0.75)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    for (let g = 0; g <= 4; g++) {
      const v = (maxVal / 4) * g;
      const gy = y(v);
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      ctx.fillText(fmtMan(v), padL - 8, gy + 3);
    }
    const years = data.length - 1;
    const step = Math.max(1, Math.round(years / 5));
    ctx.textAlign = "center";
    for (let i = 0; i < data.length; i += step) {
      ctx.fillText(`${data[i].year}年`, x(i), padT + plotH + 16);
    }
    if ((data.length - 1) % step !== 0) {
      ctx.fillText(`${data[data.length - 1].year}年`, x(data.length - 1), padT + plotH + 16);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL - 2, 0, plotW * revealT + 4, CHART_H);
    ctx.clip();

    const drawArea = (key, fillStyle, strokeStyle) => {
      ctx.beginPath();
      ctx.moveTo(x(0), y(0));
      data.forEach((d, i) => ctx.lineTo(x(i), y(d[key])));
      ctx.lineTo(x(data.length - 1), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      ctx.beginPath();
      data.forEach((d, i) => (i === 0 ? ctx.moveTo(x(i), y(d[key])) : ctx.lineTo(x(i), y(d[key]))));
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    };

    drawArea("balance", "rgba(196,149,63,0.30)", "#c4953f");
    drawArea("principal", "rgba(58,82,130,0.35)", "#3a5282");

    ctx.restore();
  }

  /* ---------------- 非課税メリット比較 ---------------- */
  function updateTaxCompare(result) {
    const profit = Math.max(0, result.profit);
    const taxedFinal = result.principal + profit * (1 - 0.20315);
    const nisaFinal = result.balance;
    const savings = profit * 0.20315;
    const maxVal = Math.max(nisaFinal, taxedFinal, 1);

    requestAnimationFrame(() => {
      $("#taxedBar").style.width = clamp((taxedFinal / maxVal) * 100, 0, 100) + "%";
      $("#nisaBar").style.width = clamp((nisaFinal / maxVal) * 100, 0, 100) + "%";
    });
    animateNumber($("#taxedValue"), taxedFinal);
    animateNumber($("#nisaValue"), nisaFinal);
    animateNumber($("#savingsValue"), savings);
  }

  /* ---------------- 全体の再計算 ---------------- */
  function recalc() {
    const result = compute(state);
    animateNumber($("#finalValue"), result.balance);
    animateNumber($("#principalValue"), result.principal);
    animateNumber($("#profitValue"), result.profit);
    $("#treeYearLabel").textContent = state.years;
    updateTaxCompare(result);
    updateChartTarget(result);
    updateTreeTarget(result);
    saveState();
  }

  /* ---------------- アニメーションループ ---------------- */
  function loop(now) {
    const followRate = REDUCED ? 1 : 0.09;
    for (const k in treeTarget) {
      treeCurrent[k] = lerp(treeCurrent[k], treeTarget[k], followRate);
    }
    drawTree(now);
    const t = REDUCED ? 1 : Math.min(1, (now - chartAnimStart) / 450);
    const eased = 1 - Math.pow(1 - t, 3);
    drawChartFrame(chartData, eased);
    requestAnimationFrame(loop);
  }

  /* ---------------- トースト ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------------- スライダーUI ---------------- */
  function syncSlidersFromState() {
    $("#tsumitateSlider").value = state.tsumitateMonthly;
    $("#tsumitateOut").textContent = fmtYen(state.tsumitateMonthly);
    $("#growthMonthlySlider").value = state.growthMonthly;
    $("#growthMonthlyOut").textContent = fmtYen(state.growthMonthly);
    $("#rateSlider").value = state.rate;
    $("#rateOut").textContent = state.rate.toFixed(1);
    $("#yearsSlider").value = state.years;
    $("#yearsOut").textContent = state.years;
    $("#lumpSlider").value = state.lumpsum;
    $("#lumpOut").textContent = fmtYen(state.lumpsum);
    $$(".preset-chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.rate) === state.rate));
    if (state.growthMonthly > 0 || state.lumpsum > 0) {
      $("#growthField").hidden = false;
      $("#growthToggle").textContent = "－ 成長投資枠を非表示にする";
    }
  }

  $("#tsumitateSlider").addEventListener("input", (e) => {
    state.tsumitateMonthly = Number(e.target.value);
    $("#tsumitateOut").textContent = fmtYen(state.tsumitateMonthly);
    recalc();
  });
  $("#growthMonthlySlider").addEventListener("input", (e) => {
    state.growthMonthly = Number(e.target.value);
    $("#growthMonthlyOut").textContent = fmtYen(state.growthMonthly);
    recalc();
  });
  $("#lumpSlider").addEventListener("input", (e) => {
    state.lumpsum = Number(e.target.value);
    $("#lumpOut").textContent = fmtYen(state.lumpsum);
    recalc();
  });
  $("#yearsSlider").addEventListener("input", (e) => {
    state.years = Number(e.target.value);
    $("#yearsOut").textContent = state.years;
    recalc();
  });
  $("#rateSlider").addEventListener("input", (e) => {
    state.rate = Number(e.target.value);
    $("#rateOut").textContent = state.rate.toFixed(1);
    $$(".preset-chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.rate) === state.rate));
    clearFundSelection();
    recalc();
  });
  $("#ratePresets").addEventListener("click", (e) => {
    const chip = e.target.closest(".preset-chip");
    if (!chip) return;
    state.rate = Number(chip.dataset.rate);
    $("#rateSlider").value = state.rate;
    $("#rateOut").textContent = state.rate.toFixed(1);
    $$(".preset-chip").forEach((c) => c.classList.toggle("active", c === chip));
    clearFundSelection();
    recalc();
  });

  /* ---------------- リアルタイム相場のUI操作 ---------------- */
  $("#realtimeToggle").addEventListener("change", (e) => {
    realtime.enabled = e.target.checked;
    $("#realtimeBody").hidden = !realtime.enabled;
    saveRealtime();
    if (!realtime.enabled) return;
    Object.keys(FUND_SOURCES).forEach(renderFundCard);
    if (realtime.selected) drawFundTrendChart(realtime.selected);
    const stale = !realtime.fetchedAt || Date.now() - realtime.fetchedAt > 12 * 60 * 60 * 1000;
    if (stale) refreshRealtimeData();
  });
  $("#realtimeRefresh").addEventListener("click", refreshRealtimeData);
  $("#fundCards").addEventListener("click", (e) => {
    const card = e.target.closest(".fund-card");
    if (!card || card.disabled) return;
    const fund = card.dataset.fund;
    const info = realtime.funds[fund];
    if (!info || info.error) return;
    realtime.selected = fund;
    saveRealtime();
    $$(".fund-card").forEach((c) => c.classList.toggle("active", c === card));
    state.rate = clamp(Math.round(info.rate * 10) / 10, 0.1, 15);
    $("#rateSlider").value = state.rate;
    $("#rateOut").textContent = state.rate.toFixed(1);
    $$(".preset-chip").forEach((c) => c.classList.remove("active"));
    recalc();
    drawFundTrendChart(fund);
    toast(`${FUND_LABELS[fund]}の実績利回り ${state.rate.toFixed(1)}% を反映しました`);
  });
  $("#growthToggle").addEventListener("click", () => {
    const field = $("#growthField");
    field.hidden = !field.hidden;
    $("#growthToggle").textContent = field.hidden ? "＋ 成長投資枠も使う（追加積立・一括購入）" : "－ 成長投資枠を非表示にする";
  });

  /* ---------------- メニュー ---------------- */
  const menuBtn = $("#menuBtn");
  const menuPanel = $("#menuPanel");
  menuBtn.addEventListener("click", () => {
    const willShow = menuPanel.hidden;
    menuPanel.hidden = !willShow;
    menuBtn.setAttribute("aria-expanded", String(willShow));
  });
  document.addEventListener("click", (e) => {
    if (!menuPanel.hidden && !menuPanel.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
      menuPanel.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });
  menuPanel.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-item");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "help") openHelpModal();
    if (action === "reset") resetInputs();
    if (action === "install") triggerInstall();
    menuPanel.hidden = true;
  });

  function resetInputs() {
    state = { ...DEFAULTS };
    syncSlidersFromState();
    $("#growthField").hidden = true;
    $("#growthToggle").textContent = "＋ 成長投資枠も使う（追加積立・一括購入）";
    clearFundSelection();
    recalc();
    toast("初期値にもどしました");
  }

  /* ---------------- ヘルプモーダル ---------------- */
  const helpModal = $("#helpModal");
  function openHelpModal() {
    helpModal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeHelpModal() {
    helpModal.hidden = true;
    document.body.style.overflow = "";
  }
  $("#helpCloseBtn").addEventListener("click", closeHelpModal);
  helpModal.addEventListener("click", (e) => { if (e.target === helpModal) closeHelpModal(); });

  /* ---------------- ボタン ripple ---------------- */
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 620);
  });

  /* ---------------- 桜と金の花びら（背景モーショングラフィックス） ---------------- */
  (function petals() {
    const canvas = $("#petals");
    const ctx = canvas.getContext("2d");
    let w, h, arr = [];

    function resize() {
      w = canvas.width = window.innerWidth * devicePixelRatio;
      h = canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    // 資産が「育つ・上がる」イメージに合わせ、花びらは下から上へ舞い上がる
    function makePetal() {
      const gold = Math.random() < 0.3;
      return {
        x: Math.random() * w,
        y: h + 20 + Math.random() * h * 0.3,
        size: (5 + Math.random() * 7) * devicePixelRatio,
        speedY: -(0.32 + Math.random() * 0.45) * devicePixelRatio,
        speedX: (Math.random() - 0.5) * 0.55 * devicePixelRatio,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.03,
        sway: Math.random() * Math.PI * 2,
        opacity: 0.45 + Math.random() * 0.4,
        gold,
      };
    }

    // 評価額が増えるほど（資産の成長＝満開に近づくほど）花びらも増やす
    const BASE_COUNT = REDUCED ? 0 : (window.innerWidth < 480 ? 9 : 14);
    const MAX_EXTRA = REDUCED ? 0 : 26;
    function desiredCount() {
      return REDUCED ? 0 : Math.round(BASE_COUNT + assetProgress * MAX_EXTRA);
    }
    for (let i = 0; i < desiredCount(); i++) {
      const p = makePetal();
      p.y = Math.random() * h;
      arr.push(p);
    }

    function drawPetal(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.gold ? "#d6b26c" : "#e8a8b0";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      const target = desiredCount();
      if (arr.length < target) {
        const addN = Math.min(2, target - arr.length);
        for (let i = 0; i < addN; i++) {
          const p = makePetal();
          p.y = h + 20 + Math.random() * h * 0.6;
          arr.push(p);
        }
      } else if (arr.length > target) {
        const removeN = Math.min(2, arr.length - target);
        for (let i = 0; i < removeN; i++) {
          let idx = 0, minY = Infinity;
          arr.forEach((p, j) => { if (p.y < minY) { minY = p.y; idx = j; } });
          arr.splice(idx, 1);
        }
      }
      arr.forEach((p) => {
        p.y += p.speedY;
        p.sway += 0.02;
        p.x += p.speedX + Math.sin(p.sway) * 0.4 * devicePixelRatio;
        p.rot += p.rotSpeed;
        if (p.y < -20) { Object.assign(p, makePetal()); p.y = h + 20; }
        drawPetal(p);
      });
      requestAnimationFrame(tick);
    }
    if (!REDUCED) requestAnimationFrame(tick);
  })();

  /* ---------------- PWA インストール ---------------- */
  let deferredPrompt = null;
  const installBanner = $("#installBanner");
  const installMenuItem = $("#installMenuItem");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.hidden = false;
    installMenuItem.hidden = false;
  });

  function triggerInstall() {
    if (!deferredPrompt) { toast("お使いのブラウザのメニューから「ホーム画面に追加」を選んでください"); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
      installBanner.hidden = true;
      installMenuItem.hidden = true;
    });
  }
  $("#installBtn").addEventListener("click", triggerInstall);
  $("#installDismiss").addEventListener("click", () => { installBanner.hidden = true; });

  window.addEventListener("appinstalled", () => {
    installBanner.hidden = true;
    installMenuItem.hidden = true;
    toast("インストールしました🌱");
  });

  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    installMenuItem.hidden = true;
  }

  if ("serviceWorker" in navigator) {
    // 新しいService Workerが有効になったら、最新版を確実に表示するため一度だけ自動リロードする
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (swRefreshing) return;
      swRefreshing = true;
      window.location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        reg.update().catch(() => {});
      }).catch((err) => console.warn("SW登録失敗", err));
    });
  }

  /* ---------------- 初期化 ---------------- */
  loadState();
  syncSlidersFromState();
  fundTrendCtx = $("#fundTrendChart").getContext("2d");
  loadRealtime();
  $("#realtimeToggle").checked = realtime.enabled;
  $("#realtimeBody").hidden = !realtime.enabled;
  if (realtime.enabled) {
    Object.keys(FUND_SOURCES).forEach(renderFundCard);
    if (realtime.selected) drawFundTrendChart(realtime.selected);
    if (!realtime.fetchedAt || Date.now() - realtime.fetchedAt > 12 * 60 * 60 * 1000) refreshRealtimeData();
  }
  treeCtx = $("#treeCanvas").getContext("2d");
  chartCtx = $("#growthChart").getContext("2d");
  try {
    recalc();
  } catch (e) {
    console.warn("初期計算に失敗しました", e);
  }
  // 初回フレームを同期描画し、アニメーションフレームを待たずに絵が出るようにする
  drawTree(performance.now());
  drawChartFrame(chartData, 1);
  requestAnimationFrame(loop);
})();
