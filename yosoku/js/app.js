/* ===========================================================
   星の羅針盤 — 株価予測シミュレータ
   eMAXIS Slim 米国株式(S&P500) / eMAXIS Slim オールカントリーの
   過去の傾向とモンテカルロ・シミュレーションによる将来予測。
   すべて端末内で計算されます（外部への通信は相場データの取得のみ）。
   =========================================================== */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const fmtYen = (n) => Math.round(n).toLocaleString("ja-JP");
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SIMS = 400;

  function fmtYenShort(n) {
    const v = Math.round(n);
    const abs = Math.abs(v);
    if (abs >= 100000000) return (v / 100000000).toFixed(v % 100000000 === 0 ? 0 : 2) + "億";
    if (abs >= 10000) return Math.round(v / 10000).toLocaleString("ja-JP") + "万";
    return v.toLocaleString("ja-JP");
  }

  /* ---------------- 状態 ---------------- */
  const STORAGE_KEY = "hoshi-rashinban:v1";
  const DEFAULTS = { lumpsum: 1000000, monthly: 30000, years: 20, mode: "compare" };
  let state = { ...DEFAULTS };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        state = {
          lumpsum: clamp(Number(p.lumpsum) || 0, 0, 5000000),
          monthly: clamp(Number(p.monthly) || 0, 0, 100000),
          years: clamp(Number(p.years) || DEFAULTS.years, 1, 30),
          mode: ["sp500", "acwi", "compare"].includes(p.mode) ? p.mode : DEFAULTS.mode,
        };
      }
    } catch (e) { /* 無視して初期値を使用 */ }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 無視 */ }
  }

  /* ---------------- 銘柄データの取得 ---------------- */
  const FUND_LABELS = { sp500: "eMAXIS Slim 米国株式(S&P500)", acwi: "eMAXIS Slim オールカントリー" };
  const FUND_SOURCES = {
    sp500: [
      { provider: "stooq", symbol: "^spx" },
      { provider: "yahoo", symbol: "^GSPC" },
    ],
    acwi: [
      { provider: "stooq", symbol: "2559.jp" },
      { provider: "yahoo", symbol: "2559.T" },
    ],
  };
  // 通信できない環境でも必ず何か表示できるよう、長期の歴史的平均を参考値として同梱
  const STATIC_FUND_REFERENCE = {
    sp500: { rate: 10.0, vol: 18.0 },
    acwi: { rate: 8.0, vol: 16.0 },
  };
  const FUND_CACHE_KEY = "hoshi-rashinban:funddata:v1";

  function fallbackInfo(fund) {
    const ref = STATIC_FUND_REFERENCE[fund];
    const sigma = (ref.vol / 100) / Math.sqrt(12);
    const mu = Math.log(1 + ref.rate / 100) / 12 - 0.5 * sigma * sigma;
    return { rate: ref.rate, vol: ref.vol, mu, sigma, series: null, fallback: true };
  }

  let fundData = { sp500: fallbackInfo("sp500"), acwi: fallbackInfo("acwi") };

  function loadFundCache() {
    try {
      const raw = localStorage.getItem(FUND_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || !parsed.data.sp500 || !parsed.data.acwi) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function saveFundCache() {
    try { localStorage.setItem(FUND_CACHE_KEY, JSON.stringify({ data: fundData, fetchedAt: Date.now() })); } catch (e) { /* 無視 */ }
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

  // データ元の欠損・異常値（特に未確定な当月分が極端な値になるケース）を取り除く
  function sanitizeSeries(rows) {
    if (rows.length < 2) return rows;
    const cleaned = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
      const prev = cleaned[cleaned.length - 1];
      const cur = rows[i];
      const ratio = cur.close / prev.close;
      if (ratio < 0.4 || ratio > 3) continue;
      cleaned.push(cur);
    }
    if (cleaned.length < 2) return rows;
    const now = new Date();
    const last = new Date(cleaned[cleaned.length - 1].date);
    if (cleaned.length > 2 && last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth()) {
      cleaned.pop();
    }
    return cleaned;
  }

  function computeStats(rows) {
    const clean = sanitizeSeries(rows);
    if (clean.length < 6) throw new Error("データが不足しています");
    const first = clean[0], last = clean[clean.length - 1];
    const years = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24 * 365.25);
    if (!(years > 0.5)) throw new Error("期間が短すぎます");
    const cagr = (Math.pow(last.close / first.close, 1 / years) - 1) * 100;

    const logReturns = [];
    for (let i = 1; i < clean.length; i++) logReturns.push(Math.log(clean[i].close / clean[i - 1].close));
    const mu = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((a, b) => a + (b - mu) * (b - mu), 0) / Math.max(1, logReturns.length - 1);
    const sigma = Math.sqrt(variance);
    const vol = sigma * Math.sqrt(12) * 100;

    let peak = -Infinity, maxDd = 0;
    clean.forEach((r) => { peak = Math.max(peak, r.close); const dd = (r.close - peak) / peak; if (dd < maxDd) maxDd = dd; });

    return { rate: cagr, vol, maxDrawdown: maxDd * 100, mu, sigma, years, asOf: last.date, series: clean, fallback: false };
  }

  const stooqUrl = (symbol) => `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=m`;
  const yahooUrl = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo`;
  const viaProxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  async function fetchOne(provider, symbol, useProxy) {
    const rawUrl = provider === "stooq" ? stooqUrl(symbol) : yahooUrl(symbol);
    const url = useProxy ? viaProxy(rawUrl) : rawUrl;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${provider} http ${res.status}`);
    if (provider === "stooq") return computeStats(parseStooqCsv(await res.text()));
    return computeStats(parseYahooChart(await res.json()));
  }

  async function fetchFundReturn(fund) {
    for (const src of FUND_SOURCES[fund]) {
      for (const useProxy of [false, true]) {
        try { return await fetchOne(src.provider, src.symbol, useProxy); }
        catch (e) { console.warn(`[星の羅針盤] ${fund} の取得に失敗 (${src.provider}${useProxy ? "/proxy" : ""}):`, e); }
      }
    }
    return fallbackInfo(fund);
  }

  function setFundLoading(fund) {
    $(`.fund-status-item[data-fund="${fund}"]`).classList.remove("fallback");
    $(`#${fund}Rate`).textContent = "…";
    $(`#${fund}Vol`).textContent = "ブレ幅 …";
    $(`#${fund}Meta`).textContent = "取得中…";
  }
  function renderFundStatus(fund) {
    const info = fundData[fund];
    const el = $(`.fund-status-item[data-fund="${fund}"]`);
    el.classList.toggle("fallback", !!info.fallback);
    $(`#${fund}Rate`).textContent = `${info.rate >= 0 ? "+" : ""}${info.rate.toFixed(1)}%`;
    $(`#${fund}Vol`).textContent = `ブレ幅 ±${info.vol.toFixed(1)}%`;
    $(`#${fund}Meta`).textContent = info.fallback
      ? "長期の歴史的平均（参考値）"
      : `${info.years >= 4.5 ? `直近${Math.round(info.years)}年` : `約${info.years.toFixed(1)}年`}・${info.asOf}時点`;
  }

  async function fetchAllFundData(announce) {
    $("#refreshBtn").disabled = true;
    setFundLoading("sp500"); setFundLoading("acwi");
    let fallbackUsed = false;
    const [sp500, acwi] = await Promise.all([
      fetchFundReturn("sp500").then((r) => { if (r.fallback) fallbackUsed = true; return r; }),
      fetchFundReturn("acwi").then((r) => { if (r.fallback) fallbackUsed = true; return r; }),
    ]);
    fundData = { sp500, acwi };
    renderFundStatus("sp500"); renderFundStatus("acwi");
    drawHistoricalChart();
    saveFundCache();
    $("#refreshBtn").disabled = false;
    if (announce) toast(fallbackUsed ? "通信できなかったため、一部は長期の歴史的平均（参考値）を表示しています" : "最新の傾向を取得しました");
    scheduleRecalc();
  }

  /* ---------------- 過去の値動き比較グラフ ---------------- */
  function buildIllustrativeSeries(rate, years = 10) {
    const months = years * 12;
    const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
    const values = []; let v = 100;
    for (let m = 0; m <= months; m++) { values.push(v); v *= 1 + monthlyRate; }
    return values;
  }
  function trimOverlap(a, b) {
    const start = a[0].date > b[0].date ? a[0].date : b[0].date;
    const end = a[a.length - 1].date < b[b.length - 1].date ? a[a.length - 1].date : b[b.length - 1].date;
    const trim = (series) => series.filter((r) => r.date >= start && r.date <= end);
    return [trim(a), trim(b)];
  }

  function buildHistSeriesInfo() {
    const sp = fundData.sp500, ac = fundData.acwi;
    if (sp && ac && sp.series && ac.series) {
      const [a, b] = trimOverlap(sp.series, ac.series);
      if (a.length >= 3 && b.length >= 3) {
        const baseA = a[0].close, baseB = b[0].close;
        return {
          sp500: { values: a.map((r) => (r.close / baseA) * 100) },
          acwi: { values: b.map((r) => (r.close / baseB) * 100) },
          illustrative: false,
          startLabel: a[0].date,
          endLabel: a[a.length - 1].date,
        };
      }
    }
    const spRate = sp ? sp.rate : STATIC_FUND_REFERENCE.sp500.rate;
    const acRate = ac ? ac.rate : STATIC_FUND_REFERENCE.acwi.rate;
    return {
      sp500: { values: buildIllustrativeSeries(spRate, 10) },
      acwi: { values: buildIllustrativeSeries(acRate, 10) },
      illustrative: true,
      startLabel: "0年目",
      endLabel: "10年目",
    };
  }

  let histCtx = null;
  function drawHistChart(info) {
    if (!histCtx) return;
    const W = 600, H = 240;
    const ctx = histCtx;
    ctx.clearRect(0, 0, W, H);
    const allV = [...info.sp500.values, ...info.acwi.values, 100];
    const minV = Math.min(...allV), maxV = Math.max(...allV);
    const range = Math.max(1, maxV - minV);
    const padL = 40, padR = 10, padT = 12, padB = 20;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const y = (v) => padT + plotH - ((v - minV) / range) * plotH;

    ctx.font = "10px sans-serif"; ctx.textAlign = "right";
    [minV, 100, maxV].forEach((v) => {
      const gy = y(v);
      ctx.strokeStyle = v === 100 ? "rgba(51,66,122,0.35)" : "rgba(90,88,122,0.16)";
      ctx.setLineDash(v === 100 ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(92,88,122,0.75)";
      ctx.fillText(v.toFixed(0), padL - 6, gy + 3);
    });

    function drawLine(values, color) {
      if (!values || values.length < 2) return;
      const x = (i) => padL + (i / (values.length - 1)) * plotW;
      ctx.beginPath();
      values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      if (info.illustrative) ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawLine(info.sp500.values, "#c49e4a");
    drawLine(info.acwi.values, "#2f8580");

    ctx.fillStyle = "rgba(92,88,122,0.75)";
    ctx.textAlign = "left"; ctx.fillText(info.startLabel, padL, H - 4);
    ctx.textAlign = "right"; ctx.fillText(info.endLabel, padL + plotW, H - 4);
  }

  function drawHistoricalChart() {
    const info = buildHistSeriesInfo();
    drawHistChart(info);
    $("#histHint").textContent = info.illustrative
      ? "実データを取得できなかったため、年率換算した参考値で複利運用したと仮定した試算カーブ（点線）を表示しています。実際の値動きではありません。"
      : `${info.startLabel} 〜 ${info.endLabel} の実績（開始時点を100として指数化）。`;
  }

  /* ---------------- モンテカルロ・シミュレーション ---------------- */
  function randNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function percentileOf(sortedArr, p) {
    const idx = clamp(Math.round(p * (sortedArr.length - 1)), 0, sortedArr.length - 1);
    return sortedArr[idx];
  }

  function simulateFund(fund, lumpsum, monthly, years, sims) {
    const months = years * 12;
    const { mu, sigma } = fund;
    const yearlySets = Array.from({ length: years + 1 }, () => new Array(sims));
    for (let s = 0; s < sims; s++) {
      let balance = lumpsum;
      yearlySets[0][s] = balance;
      for (let m = 1; m <= months; m++) {
        const factor = Math.exp(mu + sigma * randNormal());
        balance = (balance + monthly) * factor;
        if (m % 12 === 0) yearlySets[m / 12][s] = balance;
      }
    }
    const principalPath = [lumpsum];
    let principal = lumpsum;
    for (let y = 1; y <= years; y++) { principal += monthly * 12; principalPath.push(principal); }

    const yearly = yearlySets.map((set, i) => {
      const sorted = set.slice().sort((a, b) => a - b);
      return {
        year: i,
        p10: percentileOf(sorted, 0.10),
        p25: percentileOf(sorted, 0.25),
        p50: percentileOf(sorted, 0.50),
        p75: percentileOf(sorted, 0.75),
        p90: percentileOf(sorted, 0.90),
        principal: principalPath[i],
      };
    });
    const finalSorted = yearlySets[years].slice().sort((a, b) => a - b);
    const lossProb = (finalSorted.filter((v) => v < principalPath[years]).length / finalSorted.length) * 100;

    return { yearly, final: yearly[years], lossProb, principal: principalPath[years] };
  }

  /* ---------------- 予測グラフの描画 ---------------- */
  let forecastCtx = null;
  const FUND_LINE_COLOR = { sp500: "#c49e4a", acwi: "#2f8580" };

  function drawForecastChart(mode, resSp, resAc, years) {
    if (!forecastCtx) return;
    const W = 600, H = 280;
    const ctx = forecastCtx;
    ctx.clearRect(0, 0, W, H);
    const padL = 56, padR = 12, padT = 14, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x = (i) => padL + (i / years) * plotW;

    let maxVal;
    if (mode === "compare") {
      maxVal = Math.max(1, ...resSp.yearly.map((d) => d.p50), ...resAc.yearly.map((d) => d.p50), ...resSp.yearly.map((d) => d.principal)) * 1.1;
    } else {
      const res = mode === "sp500" ? resSp : resAc;
      maxVal = Math.max(1, ...res.yearly.map((d) => d.p90)) * 1.08;
    }
    const y = (v) => padT + plotH - (v / maxVal) * plotH;

    ctx.font = "10px sans-serif"; ctx.fillStyle = "rgba(92,88,122,0.75)"; ctx.textAlign = "right";
    ctx.strokeStyle = "rgba(90,88,122,0.14)";
    for (let g = 0; g <= 4; g++) {
      const v = (maxVal / 4) * g, gy = y(v);
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      ctx.fillText(fmtYenShort(v), padL - 8, gy + 3);
    }
    const step = Math.max(1, Math.round(years / 6));
    ctx.textAlign = "center";
    for (let i = 0; i <= years; i += step) ctx.fillText(`${i}年`, x(i), padT + plotH + 16);
    if (years % step !== 0) ctx.fillText(`${years}年`, x(years), padT + plotH + 16);

    function principalLine(data) {
      ctx.beginPath();
      data.forEach((d, i) => (i === 0 ? ctx.moveTo(x(i), y(d.principal)) : ctx.lineTo(x(i), y(d.principal))));
      ctx.strokeStyle = "rgba(92,88,122,0.8)"; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    if (mode !== "compare") {
      const res = mode === "sp500" ? resSp : resAc;
      const color = FUND_LINE_COLOR[mode];

      ctx.beginPath();
      res.yearly.forEach((d, i) => (i === 0 ? ctx.moveTo(x(i), y(d.p90)) : ctx.lineTo(x(i), y(d.p90))));
      for (let i = res.yearly.length - 1; i >= 0; i--) ctx.lineTo(x(i), y(res.yearly[i].p10));
      ctx.closePath(); ctx.fillStyle = "rgba(51,66,122,0.14)"; ctx.fill();

      ctx.beginPath();
      res.yearly.forEach((d, i) => (i === 0 ? ctx.moveTo(x(i), y(d.p75)) : ctx.lineTo(x(i), y(d.p75))));
      for (let i = res.yearly.length - 1; i >= 0; i--) ctx.lineTo(x(i), y(res.yearly[i].p25));
      ctx.closePath(); ctx.fillStyle = "rgba(51,66,122,0.26)"; ctx.fill();

      principalLine(res.yearly);

      ctx.beginPath();
      res.yearly.forEach((d, i) => (i === 0 ? ctx.moveTo(x(i), y(d.p50)) : ctx.lineTo(x(i), y(d.p50))));
      ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.lineJoin = "round"; ctx.stroke();

      res.yearly.forEach((d) => {
        ctx.beginPath(); ctx.arc(x(d.year), y(d.p50), 2.6, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
      });
    } else {
      principalLine(resSp.yearly);
      [["sp500", resSp], ["acwi", resAc]].forEach(([key, res]) => {
        ctx.beginPath();
        res.yearly.forEach((d, i) => (i === 0 ? ctx.moveTo(x(i), y(d.p50)) : ctx.lineTo(x(i), y(d.p50))));
        ctx.strokeStyle = FUND_LINE_COLOR[key]; ctx.lineWidth = 2.6; ctx.lineJoin = "round"; ctx.stroke();
        res.yearly.forEach((d) => {
          ctx.beginPath(); ctx.arc(x(d.year), y(d.p50), 2.6, 0, Math.PI * 2);
          ctx.fillStyle = FUND_LINE_COLOR[key]; ctx.fill();
        });
      });
    }
  }

  function updateForecastLegend(mode) {
    const el = $("#forecastLegend");
    if (mode === "compare") {
      el.innerHTML = `<span><i class="legend-line sp500"></i>S&amp;P500（中央値）</span>
        <span><i class="legend-line acwi"></i>オールカントリー（中央値）</span>
        <span><i class="legend-line principal"></i>積立元本</span>`;
    } else {
      el.innerHTML = `<span><i class="legend-line ${mode}"></i>中央値</span>
        <span><i class="legend-band band"></i>予測レンジ（80%／50%）</span>
        <span><i class="legend-line principal"></i>積立元本</span>`;
    }
  }

  function statItem(label, value, cls = "") {
    return `<div class="stat-item ${cls}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  }

  function updateStatsGrid(mode, resSp, resAc) {
    const el = $("#statsGrid");
    if (mode !== "compare") {
      const res = mode === "sp500" ? resSp : resAc;
      el.innerHTML = [
        statItem("中央値（予測期間後）", fmtYen(res.final.p50) + "円"),
        statItem("積立元本", fmtYen(res.principal) + "円"),
        statItem("楽観的（上位10%）", fmtYen(res.final.p90) + "円", "up"),
        statItem("悲観的（下位10%）", fmtYen(res.final.p10) + "円", res.final.p10 < res.principal ? "down" : ""),
        statItem("元本割れ確率", res.lossProb.toFixed(1) + "%", (res.lossProb > 30 ? "down " : "") + "wide"),
      ].join("");
    } else {
      el.innerHTML = [
        statItem("S&amp;P500 中央値", fmtYen(resSp.final.p50) + "円"),
        statItem("オールカントリー 中央値", fmtYen(resAc.final.p50) + "円"),
        statItem("S&amp;P500 元本割れ確率", resSp.lossProb.toFixed(1) + "%", resSp.lossProb > 30 ? "down" : ""),
        statItem("オールカントリー 元本割れ確率", resAc.lossProb.toFixed(1) + "%", resAc.lossProb > 30 ? "down" : ""),
        statItem("積立元本（共通）", fmtYen(resSp.principal) + "円", "wide"),
      ].join("");
    }
  }

  function updateCompareTable(resSp, resAc) {
    function row(key, label) {
      const info = fundData[key];
      const res = key === "sp500" ? resSp : resAc;
      return `<tr class="${key}">
        <th>${label}</th>
        <td>${info.rate >= 0 ? "+" : ""}${info.rate.toFixed(1)}%</td>
        <td>±${info.vol.toFixed(1)}%</td>
        <td>${fmtYenShort(res.final.p50)}円</td>
        <td>${fmtYenShort(res.final.p90)}円</td>
        <td>${fmtYenShort(res.final.p10)}円</td>
        <td>${res.lossProb.toFixed(1)}%</td>
      </tr>`;
    }
    $("#compareBody").innerHTML = row("sp500", "S&amp;P500") + row("acwi", "オールカントリー");
  }

  /* ---------------- 再計算 ---------------- */
  let recalcScheduled = false;
  function scheduleRecalc() {
    if (recalcScheduled) return;
    recalcScheduled = true;
    requestAnimationFrame(() => { recalcScheduled = false; recalc(); });
  }
  function recalc() {
    const years = state.years;
    const resSp = simulateFund(fundData.sp500, state.lumpsum, state.monthly, years, SIMS);
    const resAc = simulateFund(fundData.acwi, state.lumpsum, state.monthly, years, SIMS);
    drawForecastChart(state.mode, resSp, resAc, years);
    updateForecastLegend(state.mode);
    updateStatsGrid(state.mode, resSp, resAc);
    updateCompareTable(resSp, resAc);
    saveState();
  }

  /* ---------------- スライダー・モードUI ---------------- */
  function syncSlidersFromState() {
    $("#lumpSlider").value = state.lumpsum;
    $("#lumpOut").textContent = fmtYen(state.lumpsum);
    $("#monthlySlider").value = state.monthly;
    $("#monthlyOut").textContent = fmtYen(state.monthly);
    $("#yearsSlider").value = state.years;
    $("#yearsOut").textContent = state.years;
    $$(".mode-chip").forEach((c) => c.classList.toggle("active", c.dataset.mode === state.mode));
  }

  $("#lumpSlider").addEventListener("input", (e) => {
    state.lumpsum = Number(e.target.value);
    $("#lumpOut").textContent = fmtYen(state.lumpsum);
    scheduleRecalc();
  });
  $("#monthlySlider").addEventListener("input", (e) => {
    state.monthly = Number(e.target.value);
    $("#monthlyOut").textContent = fmtYen(state.monthly);
    scheduleRecalc();
  });
  $("#yearsSlider").addEventListener("input", (e) => {
    state.years = Number(e.target.value);
    $("#yearsOut").textContent = state.years;
    scheduleRecalc();
  });
  $("#modeChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".mode-chip");
    if (!chip) return;
    state.mode = chip.dataset.mode;
    $$(".mode-chip").forEach((c) => c.classList.toggle("active", c === chip));
    scheduleRecalc();
  });
  $("#rerollBtn").addEventListener("click", () => {
    recalc();
    toast("🎲 シミュレーションを振りなおしました");
  });
  $("#refreshBtn").addEventListener("click", () => fetchAllFundData(true));

  /* ---------------- トースト ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

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
    scheduleRecalc();
    toast("初期値にもどしました");
  }

  /* ---------------- ヘルプモーダル ---------------- */
  const helpModal = $("#helpModal");
  function openHelpModal() { helpModal.hidden = false; document.body.style.overflow = "hidden"; }
  function closeHelpModal() { helpModal.hidden = true; document.body.style.overflow = ""; }
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

  /* ---------------- 夜空の星（背景モーショングラフィックス） ---------------- */
  (function starfield() {
    const canvas = $("#stars");
    const ctx = canvas.getContext("2d");
    let w, h, stars = [], shooting = [];

    function resize() {
      w = canvas.width = window.innerWidth * devicePixelRatio;
      h = canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    function makeStar() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: (0.6 + Math.random() * 1.5) * devicePixelRatio,
        phase: Math.random() * Math.PI * 2,
        speed: 0.008 + Math.random() * 0.018,
        gold: Math.random() < 0.25,
      };
    }
    const COUNT = REDUCED ? 0 : (window.innerWidth < 480 ? 42 : 70);
    for (let i = 0; i < COUNT; i++) stars.push(makeStar());

    function maybeSpawnShoot() {
      if (!REDUCED && Math.random() < 0.006) {
        shooting.push({
          x: Math.random() * w * 0.6 + w * 0.15,
          y: Math.random() * h * 0.25,
          vx: (3.2 + Math.random() * 2.4) * devicePixelRatio,
          vy: (1.6 + Math.random() * 1.2) * devicePixelRatio,
          life: 0,
          maxLife: 34 + Math.random() * 18,
        });
      }
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      stars.forEach((s) => {
        s.phase += s.speed;
        const a = 0.3 + Math.max(0, Math.sin(s.phase)) * 0.55;
        ctx.globalAlpha = a;
        ctx.fillStyle = s.gold ? "#d8b877" : "#eef0ff";
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      maybeSpawnShoot();
      shooting = shooting.filter((m) => m.life < m.maxLife);
      shooting.forEach((m) => {
        m.life++; m.x += m.vx; m.y += m.vy;
        const t = m.life / m.maxLife;
        ctx.strokeStyle = `rgba(222,202,152,${Math.max(0, 1 - t)})`;
        ctx.lineWidth = 1.6 * devicePixelRatio;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 3.4, m.y - m.vy * 3.4); ctx.stroke();
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
    toast("インストールしました✨");
  });
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    installMenuItem.hidden = true;
  }
  if ("serviceWorker" in navigator) {
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (swRefreshing) return;
      swRefreshing = true;
      window.location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => { reg.update().catch(() => {}); }).catch((err) => console.warn("SW登録失敗", err));
    });
  }

  /* ---------------- 初期化 ---------------- */
  loadState();
  syncSlidersFromState();
  histCtx = $("#histChart").getContext("2d");
  forecastCtx = $("#forecastChart").getContext("2d");

  const cache = loadFundCache();
  if (cache) fundData = cache.data;
  renderFundStatus("sp500");
  renderFundStatus("acwi");
  drawHistoricalChart();
  recalc();

  const stale = !cache || (Date.now() - cache.fetchedAt > 12 * 60 * 60 * 1000);
  if (stale) fetchAllFundData(false);
})();
