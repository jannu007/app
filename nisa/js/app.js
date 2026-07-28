/* ===========================================================
   つみたての庭 — 新NISAシミュレーター
   複利計算・盆栽モーショングラフィックス・成長グラフ
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
  const DEFAULTS = { monthly: 30000, lumpsum: 0, rate: 5, years: 20 };
  let state = { ...DEFAULTS };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = {
          monthly: clamp(Number(parsed.monthly) || DEFAULTS.monthly, 1000, 300000),
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

  /* ---------------- 複利シミュレーション ---------------- */
  function compute(s) {
    const months = Math.round(s.years * 12);
    const i = s.rate / 100 / 12;
    let balance = s.lumpsum;
    let principal = s.lumpsum;
    const yearly = [{ year: 0, principal, balance }];
    for (let m = 1; m <= months; m++) {
      balance = (balance + s.monthly) * (1 + i);
      principal += s.monthly;
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

  /* ---------------- 盆栽の骨格（シード固定でランダム生成） ---------------- */
  const MAX_DEPTH = 6;
  const rng = mulberry32(2024);
  function buildNode(depth) {
    const node = { depth, children: [], leafSeed: rng() };
    if (depth >= MAX_DEPTH) return node;
    const nChildren = depth === 0 ? 1 : (rng() < 0.4 ? 3 : 2);
    const angles = nChildren === 1 ? [0] : nChildren === 2 ? [-1, 1] : [-1, 0, 1];
    for (let k = 0; k < nChildren; k++) {
      const child = buildNode(depth + 1);
      child.angle = angles[k] * (0.34 + rng() * 0.2) + (rng() - 0.5) * 0.1;
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
  const TREE_W = 600, TREE_H = 420;
  const POT_Y = 360, BASE_LEN = 68;
  const BLOOM_TARGET = 100000000; // 評価額1億円で満開

  let treeCurrent = { scale: 0.12, depthF: 0.6, leafDensity: 0.35, goldRatio: 0, bloomRatio: 0 };
  let treeTarget = { scale: 0.5, depthF: 2, leafDensity: 0.5, goldRatio: 0, bloomRatio: 0 };
  let hasBloomed = false;

  function updateTreeTarget(result) {
    const profitRatio = result.principal > 0 ? result.profit / result.principal : 0;
    const progress = clamp(result.balance / BLOOM_TARGET, 0, 1); // 評価額そのもので木の育ち具合を決める
    treeTarget = {
      scale: clamp(0.22 + progress * 1.1, 0.22, 1.32),
      depthF: clamp(1.3 + progress * (MAX_DEPTH + 0.5 - 1.3), 1.3, MAX_DEPTH + 1.5),
      leafDensity: clamp(0.35 + progress * 1.6 + profitRatio * 0.3, 0.35, 2.8),
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

  function drawPot(ctx) {
    const cx = TREE_W / 2;
    ctx.fillStyle = "rgba(94,140,122,0.16)";
    ctx.beginPath();
    ctx.ellipse(cx, POT_Y + 4, 128, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c4953f";
    ctx.strokeStyle = "#8a6530";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 78, POT_Y);
    ctx.lineTo(cx + 78, POT_Y);
    ctx.lineTo(cx + 60, POT_Y + 46);
    ctx.lineTo(cx - 60, POT_Y + 46);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#d6b26c";
    ctx.fillRect(cx - 84, POT_Y - 8, 168, 10);
    ctx.strokeRect(cx - 84, POT_Y - 8, 168, 10);
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
      y: POT_Y - 90 * treeCurrent.scale - Math.random() * 100 * treeCurrent.scale,
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
    drawPot(treeCtx);
    walk(treeCtx, treeSkeleton, TREE_W / 2, POT_Y - 4, -Math.PI / 2, BASE_LEN * treeCurrent.scale, treeCurrent, now);
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
    $("#monthlySlider").value = state.monthly;
    $("#monthlyOut").textContent = fmtYen(state.monthly);
    $("#rateSlider").value = state.rate;
    $("#rateOut").textContent = state.rate.toFixed(1);
    $("#yearsSlider").value = state.years;
    $("#yearsOut").textContent = state.years;
    $("#lumpSlider").value = state.lumpsum;
    $("#lumpOut").textContent = fmtYen(state.lumpsum);
    $$(".preset-chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.rate) === state.rate));
    if (state.lumpsum > 0) {
      $("#lumpField").hidden = false;
      $("#lumpToggle").textContent = "－ 一括投資額を非表示にする";
    }
  }

  $("#monthlySlider").addEventListener("input", (e) => {
    state.monthly = Number(e.target.value);
    $("#monthlyOut").textContent = fmtYen(state.monthly);
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
    recalc();
  });
  $("#ratePresets").addEventListener("click", (e) => {
    const chip = e.target.closest(".preset-chip");
    if (!chip) return;
    state.rate = Number(chip.dataset.rate);
    $("#rateSlider").value = state.rate;
    $("#rateOut").textContent = state.rate.toFixed(1);
    $$(".preset-chip").forEach((c) => c.classList.toggle("active", c === chip));
    recalc();
  });
  $("#lumpToggle").addEventListener("click", () => {
    const field = $("#lumpField");
    field.hidden = !field.hidden;
    $("#lumpToggle").textContent = field.hidden ? "＋ はじめに一括投資額を追加する" : "－ 一括投資額を非表示にする";
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
    $("#lumpField").hidden = true;
    $("#lumpToggle").textContent = "＋ はじめに一括投資額を追加する";
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

    function makePetal() {
      const gold = Math.random() < 0.3;
      return {
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.3,
        size: (5 + Math.random() * 7) * devicePixelRatio,
        speedY: (0.32 + Math.random() * 0.45) * devicePixelRatio,
        speedX: (Math.random() - 0.5) * 0.55 * devicePixelRatio,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.03,
        sway: Math.random() * Math.PI * 2,
        opacity: 0.45 + Math.random() * 0.4,
        gold,
      };
    }

    const COUNT = REDUCED ? 0 : (window.innerWidth < 480 ? 9 : 14);
    for (let i = 0; i < COUNT; i++) {
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
      arr.forEach((p) => {
        p.y += p.speedY;
        p.sway += 0.02;
        p.x += p.speedX + Math.sin(p.sway) * 0.4 * devicePixelRatio;
        p.rot += p.rotSpeed;
        if (p.y > h + 20) { Object.assign(p, makePetal()); p.y = -20; }
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
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW登録失敗", err));
    });
  }

  /* ---------------- 初期化 ---------------- */
  loadState();
  syncSlidersFromState();
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
