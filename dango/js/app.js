(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const STORAGE_KEY = "tsurun-dango:highscore";

  /* ================= ゲーム設定 ================= */
  const COLS = 6;
  const VISIBLE_ROWS = 12;
  const HIDDEN_ROWS = 2;
  const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
  const CELL = 48; // 基準セルサイズ(px)
  const SPAWN_COL = 2;

  const LOCK_DELAY = 460; // ms
  const POP_DURATION = 320; // ms
  const MAX_LEVEL = 20;

  const COLORS = [
    { key: "sakura", base: "#f2a0b6", light: "#ffe0e8", dark: "#c76a86" },
    { key: "shira", base: "#fbf6ea", light: "#ffffff", dark: "#cdc2a4" },
    { key: "yomogi", base: "#8fae6e", light: "#c9dea6", dark: "#5f7d46" },
    { key: "kuromitsu", base: "#c48a3f", light: "#e8c07a", dark: "#8f5f24" },
  ];

  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  /* ================= 状態 ================= */
  let grid = makeEmptyGrid();
  let current = null;      // {axisR,axisC,subR,subC,colorAxis,colorSub,orient}
  let nextColors = null;   // [colorA, colorB]
  let score = 0;
  let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
  let level = 1;
  let totalCleared = 0;
  let chainCounter = 0;
  let maxChainThisGame = 0;

  let state = "ready"; // ready, playing, paused, gameover
  let phase = "input";  // input, locking, popping, falling
  let phaseStart = 0;
  let lastDropTime = 0;
  let softDropActive = false;

  let poppingCells = [];
  let fallMoves = [];
  let fallDuration = 0;

  let rafId = null;

  function makeEmptyGrid() {
    return Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(null));
  }

  /* ================= キャンバス ================= */
  const boardCanvas = $("#board");
  const boardCtx = boardCanvas.getContext("2d");
  const nextCanvas = $("#nextCanvas");
  const nextCtx = nextCanvas.getContext("2d");

  function setupCanvasDPR(canvas, ctx, wCells, hCells, cell) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = wCells * cell * dpr;
    canvas.height = hCells * cell * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupCanvasDPR(boardCanvas, boardCtx, COLS, VISIBLE_ROWS, CELL);
  setupCanvasDPR(nextCanvas, nextCtx, 2, 2, 44);

  /* ================= ロジック ================= */
  function randColorIndex() {
    return Math.floor(Math.random() * COLORS.length);
  }
  function randomPieceColors() {
    return [randColorIndex(), randColorIndex()];
  }

  function isFree(r, c) {
    return r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS && grid[r][c] == null;
  }
  function canPlacePieceAt(axisR, axisC, subR, subC) {
    return isFree(axisR, axisC) && isFree(subR, subC);
  }
  function subPositionFor(axisR, axisC, orient) {
    switch (orient) {
      case 0: return { subR: axisR - 1, subC: axisC };
      case 1: return { subR: axisR, subC: axisC + 1 };
      case 2: return { subR: axisR + 1, subC: axisC };
      default: return { subR: axisR, subC: axisC - 1 };
    }
  }

  function spawnFromColors(colors) {
    const axisR = HIDDEN_ROWS - 1;
    const axisC = SPAWN_COL;
    const sub = subPositionFor(axisR, axisC, 0);
    return {
      axisR, axisC, subR: sub.subR, subC: sub.subC,
      orient: 0,
      colorAxis: colors[0], colorSub: colors[1],
    };
  }

  function canMoveDown() {
    if (!current) return false;
    return canPlacePieceAt(current.axisR + 1, current.axisC, current.subR + 1, current.subC);
  }

  function moveDown() {
    if (canMoveDown()) {
      current.axisR++; current.subR++;
      return true;
    }
    return false;
  }

  function moveHorizontal(dc) {
    if (!current) return;
    if (phase !== "input" && phase !== "locking") return;
    const na = current.axisC + dc, ns = current.subC + dc;
    if (canPlacePieceAt(current.axisR, na, current.subR, ns)) {
      current.axisC = na; current.subC = ns;
      if (phase === "locking" && canMoveDown()) { phase = "input"; }
    }
  }

  function rotate(dir) {
    if (!current) return;
    if (phase !== "input" && phase !== "locking") return;
    const newOrient = ((current.orient + dir) % 4 + 4) % 4;
    const kicks = [[0, 0], [1, 0], [-1, 0], [0, -1]]; // [dCol, dRow]
    for (const [dc, dr] of kicks) {
      const na = current.axisC + dc, nr = current.axisR + dr;
      const sub = subPositionFor(nr, na, newOrient);
      if (canPlacePieceAt(nr, na, sub.subR, sub.subC)) {
        current.axisR = nr; current.axisC = na; current.orient = newOrient;
        current.subR = sub.subR; current.subC = sub.subC;
        if (phase === "locking" && canMoveDown()) { phase = "input"; }
        return;
      }
    }
  }

  function hardDrop() {
    if (!current) return;
    if (phase !== "input" && phase !== "locking") return;
    let rows = 0;
    while (canMoveDown()) { current.axisR++; current.subR++; rows++; }
    if (rows > 0) score += rows;
    lockPiece(performance.now());
  }

  function lockPiece(now) {
    if (!current) return;
    grid[current.axisR][current.axisC] = current.colorAxis;
    grid[current.subR][current.subC] = current.colorSub;
    current = null;
    chainCounter = 0;
    beginResolveCheck(now);
  }

  function findGroups() {
    const visited = Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(false));
    const groups = [];
    for (let r = 0; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] == null || visited[r][c]) continue;
        const color = grid[r][c];
        const stack = [[r, c]];
        visited[r][c] = true;
        const cells = [];
        while (stack.length) {
          const [cr, cc] = stack.pop();
          cells.push({ r: cr, c: cc });
          for (const [dr, dc] of DIRS) {
            const nr = cr + dr, nc = cc + dc;
            if (nr >= 0 && nr < TOTAL_ROWS && nc >= 0 && nc < COLS &&
                !visited[nr][nc] && grid[nr][nc] === color) {
              visited[nr][nc] = true;
              stack.push([nr, nc]);
            }
          }
        }
        if (cells.length >= 4) groups.push(cells);
      }
    }
    return groups;
  }

  function computeFallMoves() {
    const moves = [];
    for (let c = 0; c < COLS; c++) {
      let writeRow = TOTAL_ROWS - 1;
      for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
        const val = grid[r][c];
        if (val != null) {
          if (writeRow !== r) {
            moves.push({ c, from: r, to: writeRow, color: val });
            grid[writeRow][c] = val;
            grid[r][c] = null;
          }
          writeRow--;
        }
      }
    }
    return moves;
  }

  function chainPower(chain) {
    if (chain <= 1) return 0;
    return Math.min(512, 8 * Math.pow(2, chain - 2));
  }
  function groupBonus(groupCount) {
    return groupCount <= 1 ? 0 : (groupCount - 1) * 3;
  }
  function colorBonus(colorCount) {
    return colorCount <= 1 ? 0 : (colorCount - 1) * 6;
  }

  function beginResolveCheck(now) {
    const groups = findGroups();
    if (groups.length === 0) {
      if (chainCounter > 0 && chainCounter > maxChainThisGame) maxChainThisGame = chainCounter;
      chainCounter = 0;
      updateHUD();
      spawnNext(now);
      return;
    }
    chainCounter++;
    if (chainCounter > maxChainThisGame) maxChainThisGame = chainCounter;

    const cells = groups.flat();
    const colorSet = new Set(cells.map((cell) => grid[cell.r][cell.c]));
    const bonus = Math.max(1, chainPower(chainCounter) + groupBonus(groups.length) + colorBonus(colorSet.size));
    const add = Math.round(cells.length * 10 * bonus);
    score += add;
    totalCleared += cells.length;
    maybeLevelUp();
    updateHUD();

    if (chainCounter >= 2) showChainToast(chainCounter);

    poppingCells = cells;
    phase = "popping";
    phaseStart = now;
  }

  function maybeLevelUp() {
    const newLevel = Math.min(MAX_LEVEL, 1 + Math.floor(totalCleared / 24));
    if (newLevel > level) level = newLevel;
  }

  function dropIntervalForLevel() {
    return Math.max(140, 760 - (level - 1) * 34);
  }

  function spawnNext(now) {
    current = spawnFromColors(nextColors);
    nextColors = randomPieceColors();
    drawNext();
    if (!canPlacePieceAt(current.axisR, current.axisC, current.subR, current.subC)) {
      gameOver();
      return;
    }
    phase = "input";
    lastDropTime = now;
  }

  function gameOver() {
    state = "gameover";
    current = null;
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      $("#newRecordText").hidden = false;
    } else {
      $("#newRecordText").hidden = true;
    }
    $("#finalScore").textContent = score.toLocaleString("ja-JP");
    $("#finalChain").textContent = String(maxChainThisGame);
    updateHUD();
    $("#gameOverOverlay").hidden = false;
  }

  /* ================= ゲームループ ================= */
  function update(now) {
    if (state !== "playing") return;
    switch (phase) {
      case "input": updateInputPhase(now); break;
      case "locking": updateLockingPhase(now); break;
      case "popping": updatePoppingPhase(now); break;
      case "falling": updateFallingPhase(now); break;
    }
  }

  function updateInputPhase(now) {
    const base = dropIntervalForLevel();
    const interval = softDropActive ? Math.max(28, base / 14) : base;
    if (now - lastDropTime >= interval) {
      lastDropTime = now;
      if (!moveDown()) {
        phase = "locking";
        phaseStart = now;
      }
    }
  }

  function updateLockingPhase(now) {
    if (canMoveDown()) { phase = "input"; lastDropTime = now; return; }
    if (now - phaseStart >= LOCK_DELAY) lockPiece(now);
  }

  function updatePoppingPhase(now) {
    if (now - phaseStart >= POP_DURATION) {
      poppingCells.forEach((cell) => { grid[cell.r][cell.c] = null; });
      poppingCells = [];
      const moves = computeFallMoves();
      if (moves.length > 0) {
        fallMoves = moves;
        const maxRows = moves.reduce((m, mv) => Math.max(m, mv.to - mv.from), 0);
        fallDuration = Math.min(360, 90 + maxRows * 34);
        phase = "falling";
        phaseStart = now;
      } else {
        beginResolveCheck(now);
      }
    }
  }

  function updateFallingPhase(now) {
    if (now - phaseStart >= fallDuration) {
      fallMoves = [];
      beginResolveCheck(now);
    }
  }

  function loop(now) {
    update(now);
    render(now);
    rafId = requestAnimationFrame(loop);
  }

  /* ================= 描画 ================= */
  function drawDango(ctx, cx, cy, r, colorIdx, alpha = 1, scale = 1) {
    const col = COLORS[colorIdx];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    const grad = ctx.createRadialGradient(-r * 0.32, -r * 0.35, r * 0.15, 0, 0, r * 1.05);
    grad.addColorStop(0, col.light);
    grad.addColorStop(1, col.base);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.strokeStyle = col.dark;
    ctx.globalAlpha = alpha * 0.55;
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.36, r * 0.32, r * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = alpha * 0.45;
    ctx.fill();
    ctx.restore();
  }

  function drawBridge(ctx, x1, y1, x2, y2, r, colorIdx, alpha = 1) {
    const col = COLORS[colorIdx];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = col.base;
    ctx.lineWidth = r * 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function cellCenter(r, c) {
    const visRow = r - HIDDEN_ROWS;
    return { x: c * CELL + CELL / 2, y: visRow * CELL + CELL / 2 };
  }

  function render(now) {
    const w = COLS * CELL, h = VISIBLE_ROWS * CELL;
    boardCtx.clearRect(0, 0, w, h);

    // grid lines
    boardCtx.save();
    boardCtx.strokeStyle = "rgba(120,96,80,0.08)";
    boardCtx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      boardCtx.beginPath();
      boardCtx.moveTo(c * CELL, 0);
      boardCtx.lineTo(c * CELL, h);
      boardCtx.stroke();
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      boardCtx.beginPath();
      boardCtx.moveTo(0, r * CELL);
      boardCtx.lineTo(w, r * CELL);
      boardCtx.stroke();
    }
    boardCtx.restore();

    const radius = CELL * 0.4;
    const fallingFrom = new Map();
    fallMoves.forEach((mv) => fallingFrom.set(`${mv.to},${mv.c}`, mv));
    const fallProgress = fallDuration > 0 ? Math.min(1, (now - phaseStart) / fallDuration) : 1;
    const ease = 1 - Math.pow(1 - fallProgress, 2);

    // bridges between static same-color neighbors (drawn first, under circles)
    for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = grid[r][c];
        if (val == null || fallingFrom.has(`${r},${c}`)) continue;
        const p = cellCenter(r, c);
        if (c + 1 < COLS && grid[r][c + 1] === val && !fallingFrom.has(`${r},${c + 1}`)) {
          const p2 = cellCenter(r, c + 1);
          drawBridge(boardCtx, p.x, p.y, p2.x, p2.y, radius, val);
        }
        if (r + 1 < TOTAL_ROWS && grid[r + 1][c] === val && !fallingFrom.has(`${r + 1},${c}`)) {
          const p2 = cellCenter(r + 1, c);
          drawBridge(boardCtx, p.x, p.y, p2.x, p2.y, radius, val);
        }
      }
    }

    // static dango
    for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = grid[r][c];
        if (val == null || fallingFrom.has(`${r},${c}`)) continue;
        const p = cellCenter(r, c);
        drawDango(boardCtx, p.x, p.y, radius, val);
      }
    }

    // falling animation
    fallMoves.forEach((mv) => {
      const fromP = cellCenter(mv.from, mv.c);
      const toP = cellCenter(mv.to, mv.c);
      const y = fromP.y + (toP.y - fromP.y) * ease;
      drawDango(boardCtx, toP.x, y, radius, mv.color);
    });

    // popping animation
    if (poppingCells.length > 0) {
      const t = Math.min(1, (now - phaseStart) / POP_DURATION);
      const scale = 1 + t * 0.35;
      const alpha = 1 - t;
      poppingCells.forEach((cell) => {
        const val = grid[cell.r][cell.c];
        if (val == null) return;
        const p = cellCenter(cell.r, cell.c);
        drawDango(boardCtx, p.x, p.y, radius, val, alpha, scale);
      });
    }

    // current piece
    if (current) {
      if (current.axisR >= HIDDEN_ROWS || current.subR >= HIDDEN_ROWS) {
        if (current.subR === current.axisR - 1 || current.subC === current.axisC - 1 ||
            current.subC === current.axisC + 1 || current.subR === current.axisR + 1) {
          const pa = cellCenter(current.axisR, current.axisC);
          const ps = cellCenter(current.subR, current.subC);
          if (current.axisR >= HIDDEN_ROWS && current.subR >= HIDDEN_ROWS) {
            drawBridge(boardCtx, pa.x, pa.y, ps.x, ps.y, radius, current.colorAxis);
          }
        }
        if (current.axisR >= HIDDEN_ROWS) {
          const pa = cellCenter(current.axisR, current.axisC);
          drawDango(boardCtx, pa.x, pa.y, radius, current.colorAxis);
        }
        if (current.subR >= HIDDEN_ROWS) {
          const ps = cellCenter(current.subR, current.subC);
          drawDango(boardCtx, ps.x, ps.y, radius, current.colorSub);
        }
      }
    }
  }

  function drawNext() {
    const w = 2 * 44, h = 2 * 44;
    nextCtx.clearRect(0, 0, w, h);
    if (!nextColors) return;
    const r = 44 * 0.4;
    const cx = w / 2;
    drawBridge(nextCtx, cx, 44 * 0.55, cx, 44 * 1.45, r, nextColors[0]);
    drawDango(nextCtx, cx, 44 * 0.55, r, nextColors[0]);
    drawDango(nextCtx, cx, 44 * 1.45, r, nextColors[1]);
  }

  /* ================= HUD ================= */
  function updateHUD() {
    $("#scoreValue").textContent = score.toLocaleString("ja-JP");
    $("#bestValue").textContent = best.toLocaleString("ja-JP");
    $("#levelValue").textContent = String(level);
  }

  function showChainToast(chain) {
    const el = $("#chainToast");
    el.textContent = `${chain}れんさ！`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ================= ゲーム制御 ================= */
  function startGame() {
    grid = makeEmptyGrid();
    score = 0; level = 1; totalCleared = 0; chainCounter = 0; maxChainThisGame = 0;
    poppingCells = []; fallMoves = [];
    nextColors = randomPieceColors();
    state = "playing";
    spawnNext(performance.now());
    updateHUD();
    $("#startOverlay").hidden = true;
    $("#pauseOverlay").hidden = true;
    $("#gameOverOverlay").hidden = true;
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      $("#pauseOverlay").hidden = false;
    } else if (state === "paused") {
      state = "playing";
      $("#pauseOverlay").hidden = true;
      lastDropTime = performance.now();
      phaseStart = performance.now();
    }
  }

  /* ================= 入力: キーボード ================= */
  window.addEventListener("keydown", (e) => {
    if (state === "ready" && (e.code === "Space" || e.code === "Enter")) {
      startGame();
      return;
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "playing" || state === "paused") { e.preventDefault(); togglePause(); }
      return;
    }
    if (state !== "playing") return;
    switch (e.code) {
      case "ArrowLeft": e.preventDefault(); moveHorizontal(-1); break;
      case "ArrowRight": e.preventDefault(); moveHorizontal(1); break;
      case "ArrowDown": e.preventDefault(); softDropActive = true; break;
      case "ArrowUp": case "KeyX": e.preventDefault(); rotate(1); break;
      case "KeyZ": e.preventDefault(); rotate(-1); break;
      case "Space": e.preventDefault(); hardDrop(); break;
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") softDropActive = false;
  });

  /* ================= 入力: タッチボタン ================= */
  document.querySelectorAll(".tc-btn").forEach((btn) => {
    const action = btn.dataset.action;
    const press = (e) => {
      e.preventDefault();
      if (state !== "playing") return;
      if (action === "left") moveHorizontal(-1);
      else if (action === "right") moveHorizontal(1);
      else if (action === "rotatecw") rotate(1);
      else if (action === "rotateccw") rotate(-1);
      else if (action === "harddrop") hardDrop();
      else if (action === "softdrop") softDropActive = true;
    };
    btn.addEventListener("pointerdown", press);
    if (action === "softdrop") {
      btn.addEventListener("pointerup", () => { softDropActive = false; });
      btn.addEventListener("pointerleave", () => { softDropActive = false; });
      btn.addEventListener("pointercancel", () => { softDropActive = false; });
    }
  });

  /* ================= 入力: 盤面スワイプ・タップ ================= */
  (() => {
    const wrap = $(".board-wrap");
    let startX = 0, startY = 0, startT = 0, moved = false;
    const SWIPE_THRESHOLD = 26;
    wrap.addEventListener("pointerdown", (e) => {
      startX = e.clientX; startY = e.clientY; startT = performance.now();
      moved = false;
    });
    wrap.addEventListener("pointermove", (e) => {
      if (state !== "playing") return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        moveHorizontal(dx > 0 ? 1 : -1);
        startX = e.clientX;
        moved = true;
      }
    });
    wrap.addEventListener("pointerup", (e) => {
      if (state !== "playing") return;
      const dy = e.clientY - startY;
      const dt = performance.now() - startT;
      if (!moved) {
        if (dy > 60) hardDrop();
        else if (dt < 260) rotate(1);
      }
    });
  })();

  /* ================= ボタン各種 ================= */
  $("#startBtn").addEventListener("click", startGame);
  $("#retryBtn").addEventListener("click", startGame);
  $("#pauseRestartBtn").addEventListener("click", startGame);
  $("#pauseBtn").addEventListener("click", togglePause);
  $("#resumeBtn").addEventListener("click", togglePause);

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  $("#howtoBtn").addEventListener("click", () => openModal("#howtoModal"));
  $("#howtoBtn2").addEventListener("click", () => openModal("#howtoModal"));
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal("#" + btn.dataset.close));
  });

  /* ================= メニュー ================= */
  const menuBtn = $("#menuBtn");
  const menuPanel = $("#menuPanel");
  const menuScrim = $("#menuScrim");
  function closeMenu() {
    menuPanel.hidden = true;
    menuScrim.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  function openMenu() {
    menuPanel.hidden = false;
    menuScrim.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
  }
  menuBtn.addEventListener("click", () => (menuPanel.hidden ? openMenu() : closeMenu()));
  menuScrim.addEventListener("click", closeMenu);
  menuPanel.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item) return;
    const action = item.dataset.action;
    closeMenu();
    if (action === "howto") openModal("#howtoModal");
    else if (action === "restart") startGame();
    else if (action === "resetscore") {
      best = 0;
      localStorage.setItem(STORAGE_KEY, "0");
      updateHUD();
      toast("ハイスコアをリセットしました");
    } else if (action === "install") {
      triggerInstall();
    }
  });

  /* ================= ボタン ripple ================= */
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

  /* ================= 可視性: 非表示時は自動一時停止 ================= */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" && state === "playing") togglePause();
  });

  /* ================= PWA インストール ================= */
  let deferredPrompt = null;
  const installMenuItem = $("#installMenuItem");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installMenuItem.hidden = false;
  });

  function triggerInstall() {
    if (!deferredPrompt) { toast("お使いのブラウザのメニューから「ホーム画面に追加」を選んでください"); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
      installMenuItem.hidden = true;
    });
  }

  window.addEventListener("appinstalled", () => {
    installMenuItem.hidden = true;
    toast("インストールしました🍡");
  });

  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    installMenuItem.hidden = true;
  }

  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update();
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update();
          });
        })
        .catch((err) => console.warn("SW登録失敗", err));
    });
    let swRefreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) return;
      if (swRefreshed) return;
      swRefreshed = true;
      window.location.reload();
    });
  }

  /* ================= 初期化 ================= */
  updateHUD();
  drawNext();
  render(performance.now());
  rafId = requestAnimationFrame(loop);
})();
