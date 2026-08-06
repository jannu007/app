(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const STATE_KEY = "kasane:state";
  const STATS_KEY = "kasane:stats";

  const SUITS = ["S", "H", "C", "D"];
  const SUIT_GLYPH = { S: "♠", H: "♥", C: "♣", D: "♦" };
  const SUIT_COLOR = { S: "black", H: "red", C: "black", D: "red" };
  const RANK_LABEL = (r) => (r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r));

  const FACE_UP_GAP_RATIO = 0.30;
  const FACE_DOWN_GAP_RATIO = 0.13;
  const WASTE_FAN_RATIO = 0.22;

  const SCORE = {
    WASTE_TO_TABLEAU: 5,
    WASTE_TO_FOUNDATION: 10,
    TABLEAU_TO_FOUNDATION: 10,
    FOUNDATION_TO_TABLEAU: -15,
    FLIP: 5,
    REDEAL: -20,
  };

  /* ================= 状態 ================= */
  let zones = null;
  let drawMode = 3;
  let score = 0, moves = 0, redeals = 0, elapsedSeconds = 0;
  let history = [];
  let won = false;
  let timerHandle = null;
  let cardW = 50, cardH = 70;
  let zoneRects = null;
  let cardEls = new Map();
  let lastFaceState = new Map();
  let dragState = null;
  let lastTap = null;
  let autoPlaying = false;

  const zoneEls = {
    stock: document.getElementById("zone-stock"),
    waste: document.getElementById("zone-waste"),
    foundation: {
      S: document.getElementById("zone-f-spade"),
      H: document.getElementById("zone-f-heart"),
      C: document.getElementById("zone-f-club"),
      D: document.getElementById("zone-f-diamond"),
    },
    tableau: [0, 1, 2, 3, 4, 5, 6].map((i) => document.getElementById("zone-t" + i)),
  };
  const boardEl = $("#board");
  const cardLayerEl = $("#cardLayer");

  /* ================= デッキ ================= */
  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ id: suit + rank, suit, rank, faceUp: false });
      }
    }
    return deck;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /* ================= カードDOM生成（初回のみ） ================= */
  function buildCardFaceHTML(card) {
    const glyph = SUIT_GLYPH[card.suit];
    const label = RANK_LABEL(card.rank);
    const colorClass = SUIT_COLOR[card.suit] === "red" ? "suit-red" : "suit-black";
    const corner = (extra) => `<span class="corner ${extra}"><span class="r">${label}</span><span class="s">${glyph}</span></span>`;
    let center;
    if (card.rank >= 11) {
      center = `<div class="court"><div class="court-ring">${label}</div></div>`;
    } else {
      center = `<div class="pip-center">${glyph}</div>`;
    }
    return `<div class="card-face ${colorClass}">${corner("tl")}${center}${corner("br")}</div>`;
  }

  function createCardElements() {
    const deck = buildDeck();
    deck.forEach((card) => {
      const el = document.createElement("div");
      el.className = "card";
      el.id = "card-" + card.id;
      el.dataset.id = card.id;
      el.style.transform = "translate(0px, 0px)";
      const inner = document.createElement("div");
      inner.className = "card-inner";
      inner.innerHTML = buildCardFaceHTML(card) + `<div class="card-back"><div class="mark"><span></span><span></span><span></span></div></div>`;
      el.appendChild(inner);
      el.addEventListener("pointerdown", onCardPointerDown);
      cardLayerEl.appendChild(el);
      cardEls.set(card.id, el);
      lastFaceState.set(card.id, false);
    });
  }

  /* ================= ゲーム状態 ================= */
  function freshZones() {
    return { stock: [], waste: [], foundation: { S: [], H: [], C: [], D: [] }, tableau: [[], [], [], [], [], [], []] };
  }

  function newGame(mode) {
    if (mode) drawMode = mode;
    const deck = buildDeck();
    shuffle(deck);
    zones = freshZones();
    let di = 0;
    for (let col = 0; col < 7; col++) {
      for (let i = 0; i <= col; i++) {
        const card = deck[di++];
        card.faceUp = i === col;
        zones.tableau[col].push(card);
      }
    }
    while (di < deck.length) {
      const card = deck[di++];
      card.faceUp = false;
      zones.stock.push(card);
    }
    score = 0; moves = 0; redeals = 0; elapsedSeconds = 0; won = false;
    history = [];
    $("#winBanner").hidden = true;
    startTimer();
    updateUndoButton();
    updateAutoButton();
    save();
    render(true);
  }

  function cloneZones() {
    return JSON.parse(JSON.stringify(zones));
  }

  function pushHistory() {
    history.push({ zones: cloneZones(), score, moves, redeals });
    if (history.length > 200) history.shift();
    updateUndoButton();
  }

  function undo() {
    if (!history.length || autoPlaying) return;
    const snap = history.pop();
    zones = snap.zones;
    score = snap.score; moves = snap.moves; redeals = snap.redeals;
    updateUndoButton();
    updateAutoButton();
    save();
    render();
  }

  function updateUndoButton() {
    $("#undoBtn").disabled = history.length === 0;
  }

  /* ================= 保存 / 復元 ================= */
  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ zones, drawMode, score, moves, redeals, elapsedSeconds, won }));
    } catch (e) {}
  }
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { gamesPlayed: 0, wins: 0, bestTime: null, bestScore: 0, bestMoves: null }; }
    catch (e) { return { gamesPlayed: 0, wins: 0, bestTime: null, bestScore: 0, bestMoves: null }; }
  }
  function saveStats(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
  }

  function tryRestore() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.zones || data.won) return false;
      zones = data.zones;
      drawMode = data.drawMode || 3;
      score = data.score || 0;
      moves = data.moves || 0;
      redeals = data.redeals || 0;
      elapsedSeconds = data.elapsedSeconds || 0;
      won = false;
      history = [];
      return true;
    } catch (e) { return false; }
  }

  /* ================= タイマー ================= */
  function startTimer() {
    stopTimer();
    updateTimeDisplay();
    timerHandle = setInterval(() => {
      elapsedSeconds++;
      updateTimeDisplay();
      if (elapsedSeconds % 5 === 0) save();
    }, 1000);
  }
  function stopTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }
  function updateTimeDisplay() {
    const m = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
    const s = (elapsedSeconds % 60).toString().padStart(2, "0");
    $("#timeValue").textContent = `${m}:${s}`;
  }

  /* ================= レイアウト計算 ================= */
  function computeCardSize() {
    const rect = boardEl.getBoundingClientRect();
    const inner = rect.width - 16; // board padding 8px*2
    const gapX = Math.max(3, Math.round(inner * 0.012));
    cardW = Math.floor((inner - gapX * 6) / 7);
    cardW = Math.max(34, Math.min(64, cardW));
    cardH = Math.round(cardW * 1.42);
    boardEl.style.setProperty("--card-w", cardW + "px");
    boardEl.style.setProperty("--card-h", cardH + "px");
    boardEl.style.setProperty("--gap-x", gapX + "px");
  }

  function computeZoneRects() {
    const layerRect = cardLayerEl.getBoundingClientRect();
    const rel = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - layerRect.left, y: r.top - layerRect.top, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    zoneRects = {
      stock: rel(zoneEls.stock),
      waste: rel(zoneEls.waste),
      foundation: { S: rel(zoneEls.foundation.S), H: rel(zoneEls.foundation.H), C: rel(zoneEls.foundation.C), D: rel(zoneEls.foundation.D) },
      tableau: zoneEls.tableau.map(rel),
    };
  }

  function relayout() {
    computeCardSize();
    computeZoneRects();
    render();
  }

  /* ================= 描画 ================= */
  function render(instant) {
    if (!zoneRects) computeZoneRects();
    let z = 1;

    const placeStack = (cards, x, y, gapUp, gapDown, fanLastN, fanRatio) => {
      let cy = y;
      cards.forEach((card, i) => {
        const isFanned = fanLastN > 0 && i >= cards.length - fanLastN;
        const fanIndex = isFanned ? i - (cards.length - fanLastN) : 0;
        const px = isFanned ? x + fanIndex * cardW * fanRatio : x;
        const py = fanLastN > 0 ? y : cy;
        setCardTransform(card, px, py, z++, instant);
        if (fanLastN === 0) cy += card.faceUp ? cardH * gapUp : cardH * gapDown;
      });
    };

    // 山札：常に同じ位置に裏向きで積む
    zones.stock.forEach((card) => {
      card.faceUp = false;
      setCardTransform(card, zoneRects.stock.x, zoneRects.stock.y, z++, instant);
    });
    zoneEls.stock.classList.toggle("empty", zones.stock.length === 0);

    // 捨て札：直近3枚（またはモードに応じて）を扇状に
    const fanCount = drawMode === 3 ? Math.min(3, zones.waste.length) : Math.min(1, zones.waste.length);
    placeStack(zones.waste, zoneRects.waste.x, zoneRects.waste.y, 0, 0, fanCount, WASTE_FAN_RATIO);

    // 組札
    for (const suit of SUITS) {
      const r = zoneRects.foundation[suit];
      zones.foundation[suit].forEach((card) => setCardTransform(card, r.x, r.y, z++, instant));
    }

    // 場札
    zones.tableau.forEach((col, ci) => {
      const r = zoneRects.tableau[ci];
      placeStack(col, r.x, r.y, FACE_UP_GAP_RATIO, FACE_DOWN_GAP_RATIO, 0, 0);
    });

    updateHUD();
  }

  function setCardTransform(card, x, y, z, instant) {
    const el = cardEls.get(card.id);
    if (!el) return;
    el.style.zIndex = String(z);
    if (instant) {
      el.classList.add("dragging"); // borrow no-transition behavior
      el.style.transform = `translate(${x}px, ${y}px)`;
      void el.offsetWidth;
      el.classList.remove("dragging");
      lastFaceState.set(card.id, card.faceUp);
      el.classList.toggle("is-facedown", !card.faceUp);
      return;
    }
    el.style.transform = `translate(${x}px, ${y}px)`;
    const wasFaceUp = lastFaceState.get(card.id);
    if (wasFaceUp !== card.faceUp) {
      lastFaceState.set(card.id, card.faceUp);
      const inner = el.querySelector(".card-inner");
      inner.classList.add("flipping");
      setTimeout(() => {
        el.classList.toggle("is-facedown", !card.faceUp);
      }, 140);
      setTimeout(() => inner.classList.remove("flipping"), 300);
    } else {
      el.classList.toggle("is-facedown", !card.faceUp);
    }
  }

  function updateHUD() {
    $("#scoreValue").textContent = String(Math.max(0, score));
    $("#movesValue").textContent = String(moves);
  }

  /* ================= ルール判定 ================= */
  function top(arr) { return arr.length ? arr[arr.length - 1] : null; }

  function canStackTableau(card, targetCol) {
    const t = top(targetCol);
    if (!t) return card.rank === 13;
    if (SUIT_COLOR[card.suit] === SUIT_COLOR[t.suit]) return false;
    return card.rank === t.rank - 1;
  }
  function canStackFoundation(card, pile) {
    const t = top(pile);
    if (!t) return card.rank === 1;
    return card.suit === t.suit && card.rank === t.rank + 1;
  }

  function locateCard(id) {
    const si = zones.stock.findIndex((c) => c.id === id);
    if (si !== -1) return { type: "stock", index: si };
    const wi = zones.waste.findIndex((c) => c.id === id);
    if (wi !== -1) return { type: "waste", index: wi };
    for (const suit of SUITS) {
      const fi = zones.foundation[suit].findIndex((c) => c.id === id);
      if (fi !== -1) return { type: "foundation", suit, index: fi };
    }
    for (let ci = 0; ci < 7; ci++) {
      const ti = zones.tableau[ci].findIndex((c) => c.id === id);
      if (ti !== -1) return { type: "tableau", col: ci, index: ti };
    }
    return null;
  }

  function getPile(loc) {
    if (loc.type === "stock") return zones.stock;
    if (loc.type === "waste") return zones.waste;
    if (loc.type === "foundation") return zones.foundation[loc.suit];
    return zones.tableau[loc.col];
  }

  function isLiftable(loc) {
    const pile = getPile(loc);
    if (loc.type === "stock") return false;
    if (loc.type === "waste" || loc.type === "foundation") return loc.index === pile.length - 1;
    // tableau: must be face-up
    return pile[loc.index].faceUp;
  }

  function dragGroupFor(loc) {
    const pile = getPile(loc);
    return pile.slice(loc.index).map((c) => c.id);
  }

  function removeGroup(loc, count) {
    const pile = getPile(loc);
    return pile.splice(loc.index, count);
  }

  function afterRemoveFlip(loc) {
    if (loc.type !== "tableau") return false;
    const col = zones.tableau[loc.col];
    if (col.length && !top(col).faceUp) {
      top(col).faceUp = true;
      return true;
    }
    return false;
  }

  /* ================= 移動実行 ================= */
  function commitMove(loc, targetType, targetKey) {
    const group = removeGroup(loc, getPile(loc).length - loc.index);
    let delta = 0;
    if (targetType === "foundation") {
      zones.foundation[targetKey].push(...group);
      delta += loc.type === "waste" ? SCORE.WASTE_TO_FOUNDATION : SCORE.TABLEAU_TO_FOUNDATION;
    } else if (targetType === "tableau") {
      zones.tableau[targetKey].push(...group);
      if (loc.type === "waste") delta += SCORE.WASTE_TO_TABLEAU;
      if (loc.type === "foundation") delta += SCORE.FOUNDATION_TO_TABLEAU;
    }
    if (afterRemoveFlip(loc)) delta += SCORE.FLIP;
    score = Math.max(0, score + delta);
    moves++;
    checkWin();
  }

  function attemptMove(cardId, clientX, clientY) {
    const loc = locateCard(cardId);
    if (!loc || !isLiftable(loc)) return false;
    const group = dragGroupFor(loc);
    const movingCard = getPile(loc)[loc.index];
    const target = resolveDropZone(clientX, clientY);
    if (!target) return false;
    const targetType = target.dataset.zone;
    if (targetType === loc.type && ((targetType === "tableau" && Number(target.dataset.col) === loc.col) || (targetType === "foundation" && target.dataset.suit === loc.suit))) {
      return false; // same pile, no-op
    }
    let ok = false, targetKey = null;
    if (targetType === "foundation") {
      if (group.length !== 1) return false;
      const suit = target.dataset.suit;
      if (movingCard.suit !== suit) return false;
      if (canStackFoundation(movingCard, zones.foundation[suit])) { ok = true; targetKey = suit; }
    } else if (targetType === "tableau") {
      const col = Number(target.dataset.col);
      if (canStackTableau(movingCard, zones.tableau[col])) { ok = true; targetKey = col; }
    }
    if (!ok) return false;
    pushHistory();
    commitMove(loc, targetType, targetKey);
    save();
    render();
    updateAutoButton();
    return true;
  }

  function tryAutoMove(cardId) {
    const loc = locateCard(cardId);
    if (!loc || !isLiftable(loc)) return;
    const group = dragGroupFor(loc);
    if (group.length !== 1) return;
    const movingCard = getPile(loc)[loc.index];
    if (canStackFoundation(movingCard, zones.foundation[movingCard.suit])) {
      pushHistory();
      commitMove(loc, "foundation", movingCard.suit);
      save(); render(); updateAutoButton();
      return;
    }
    for (let ci = 0; ci < 7; ci++) {
      if (loc.type === "tableau" && loc.col === ci) continue;
      if (canStackTableau(movingCard, zones.tableau[ci])) {
        pushHistory();
        commitMove(loc, "tableau", ci);
        save(); render(); updateAutoButton();
        return;
      }
    }
  }

  function resolveDropZone(clientX, clientY) {
    const topRowRect = document.querySelector(".top-row").getBoundingClientRect();
    if (clientY <= topRowRect.bottom + 12) {
      const candidates = [zoneEls.stock, zoneEls.waste, zoneEls.foundation.S, zoneEls.foundation.H, zoneEls.foundation.C, zoneEls.foundation.D];
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (clientX >= r.left - 4 && clientX <= r.right + 4) return el;
      }
    }
    let best = null, bestDist = Infinity;
    zoneEls.tableau.forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.right) / 2;
      const d = Math.abs(clientX - cx);
      if (d < bestDist) { bestDist = d; best = el; }
    });
    return best;
  }

  /* ================= 山札タップ ================= */
  function handleStockTap() {
    if (autoPlaying) return;
    pushHistory();
    if (zones.stock.length > 0) {
      const n = Math.min(drawMode, zones.stock.length);
      for (let i = 0; i < n; i++) {
        const card = zones.stock.pop();
        card.faceUp = true;
        zones.waste.push(card);
      }
    } else if (zones.waste.length > 0) {
      while (zones.waste.length) {
        const card = zones.waste.pop();
        card.faceUp = false;
        zones.stock.push(card);
      }
      redeals++;
      score = Math.max(0, score + SCORE.REDEAL);
    } else {
      history.pop();
      updateUndoButton();
      return;
    }
    moves++;
    save();
    render();
    updateUndoButton();
    updateAutoButton();
  }
  zoneEls.stock.addEventListener("click", handleStockTap);

  /* ================= ドラッグ操作 ================= */
  function onCardPointerDown(e) {
    if (won || autoPlaying) return;
    const id = e.currentTarget.dataset.id;
    const loc = locateCard(id);
    if (!loc) return;
    if (loc.type === "stock") { handleStockTap(); return; }
    if (!isLiftable(loc)) return;

    const group = dragGroupFor(loc);
    const els = group.map((cid) => cardEls.get(cid));
    const startTransforms = els.map((el) => readTranslate(el));
    const pointerStartX = e.clientX, pointerStartY = e.clientY;
    let moved = false;

    els.forEach((el, i) => { el.classList.add("dragging"); el.style.zIndex = String(2000 + i); });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}

    function onMove(ev) {
      const dx = ev.clientX - pointerStartX, dy = ev.clientY - pointerStartY;
      if (!moved && (Math.abs(dx) + Math.abs(dy) > 4)) moved = true;
      els.forEach((el, i) => {
        el.style.transform = `translate(${startTransforms[i].x + dx}px, ${startTransforms[i].y + dy}px)`;
      });
    }
    function onUp(ev) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      els.forEach((el) => el.classList.remove("dragging"));

      if (!moved) {
        const now = performance.now();
        if (lastTap && lastTap.id === id && now - lastTap.time < 320) {
          lastTap = null;
          tryAutoMove(id);
        } else {
          lastTap = { id, time: now };
          render();
        }
        return;
      }
      const success = attemptMove(id, ev.clientX, ev.clientY);
      if (!success) {
        els.forEach((el) => el.classList.add("invalid"));
        setTimeout(() => els.forEach((el) => el.classList.remove("invalid")), 360);
        render();
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function readTranslate(el) {
    const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  }

  /* ================= 自動で仕上げる ================= */
  function allTableauFaceUp() {
    return zones.tableau.every((col) => col.every((c) => c.faceUp));
  }
  function updateAutoButton() {
    const btn = $("#autoBtn");
    const eligible = !won && allTableauFaceUp() && !autoPlaying;
    btn.hidden = !eligible;
  }

  function autoComplete() {
    if (autoPlaying || won) return;
    autoPlaying = true;
    pushHistory();
    $("#autoBtn").hidden = true;

    function step() {
      if (won) { autoPlaying = false; return; }
      let movedAny = false;
      for (let ci = 0; ci < 7 && !movedAny; ci++) {
        const col = zones.tableau[ci];
        const c = top(col);
        if (c && canStackFoundation(c, zones.foundation[c.suit])) {
          removeGroup({ type: "tableau", col: ci, index: col.length - 1 }, 1);
          zones.foundation[c.suit].push(c);
          score = Math.max(0, score + SCORE.TABLEAU_TO_FOUNDATION);
          movedAny = true;
        }
      }
      if (!movedAny) {
        const w = top(zones.waste);
        if (w && canStackFoundation(w, zones.foundation[w.suit])) {
          zones.waste.pop();
          zones.foundation[w.suit].push(w);
          score = Math.max(0, score + SCORE.WASTE_TO_FOUNDATION);
          movedAny = true;
        }
      }
      if (!movedAny && zones.stock.length > 0) {
        const c = zones.stock.pop();
        c.faceUp = true;
        zones.waste.push(c);
        movedAny = true;
      }
      if (!movedAny && zones.stock.length === 0 && zones.waste.length > 0) {
        while (zones.waste.length) {
          const c = zones.waste.pop();
          c.faceUp = false;
          zones.stock.push(c);
        }
        movedAny = true;
      }
      render();
      checkWin();
      if (won) { autoPlaying = false; save(); return; }
      if (movedAny) {
        setTimeout(step, 90);
      } else {
        autoPlaying = false;
        save();
        updateAutoButton();
      }
    }
    step();
  }
  $("#autoBtn").addEventListener("click", autoComplete);

  /* ================= あがり判定 ================= */
  function checkWin() {
    if (won) return;
    const total = SUITS.reduce((s, suit) => s + zones.foundation[suit].length, 0);
    if (total !== 52) return;
    won = true;
    stopTimer();
    autoPlaying = false;
    const stats = loadStats();
    stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
    stats.wins = (stats.wins || 0) + 1;
    const timeBonus = Math.max(0, 500 - elapsedSeconds * 2);
    score = Math.max(0, score + timeBonus);
    if (stats.bestTime == null || elapsedSeconds < stats.bestTime) stats.bestTime = elapsedSeconds;
    if (score > (stats.bestScore || 0)) stats.bestScore = score;
    if (stats.bestMoves == null || moves < stats.bestMoves) stats.bestMoves = moves;
    saveStats(stats);
    save();
    updateHUD();
    playWinCascade(() => showWinBanner(stats));
  }

  function playWinCascade(done) {
    const ids = [...cardEls.keys()];
    const vw = window.innerWidth, vh = window.innerHeight;
    ids.forEach((id, i) => {
      const el = cardEls.get(id);
      el.style.transitionDelay = (i * 22) + "ms";
      el.style.transitionDuration = "700ms";
      el.style.transitionTimingFunction = "cubic-bezier(.5,-0.2,.8,.4)";
      const tx = Math.random() * vw - vw / 2;
      requestAnimationFrame(() => {
        el.style.transform = `translate(${tx}px, ${vh}px) rotate(${(Math.random() * 720 - 360).toFixed(0)}deg)`;
      });
    });
    setTimeout(() => {
      ids.forEach((id) => {
        const el = cardEls.get(id);
        el.style.transitionDelay = "";
        el.style.transitionDuration = "";
        el.style.transitionTimingFunction = "";
      });
      done();
    }, ids.length * 22 + 750);
  }

  function showWinBanner(stats) {
    const m = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
    const s = (elapsedSeconds % 60).toString().padStart(2, "0");
    $("#winStats").innerHTML = `タイム ${m}:${s} ／ 手数 ${moves} ／ スコア ${score}` +
      (stats.bestTime === elapsedSeconds ? "<br>🏆 最速タイム更新！" : "");
    $("#winBanner").hidden = false;
  }
  $("#winNewGameBtn").addEventListener("click", () => { $("#winBanner").hidden = true; newGame(); });

  /* ================= UI: メニュー・モーダル・トースト ================= */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  $("#undoBtn").addEventListener("click", undo);

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal("#" + btn.dataset.close));
  });

  const menuBtn = $("#menuBtn");
  const menuPanel = $("#menuPanel");
  const menuScrim = $("#menuScrim");
  function closeMenu() { menuPanel.hidden = true; menuScrim.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  function openMenu() { menuPanel.hidden = false; menuScrim.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); }
  menuBtn.addEventListener("click", () => (menuPanel.hidden ? openMenu() : closeMenu()));
  menuScrim.addEventListener("click", closeMenu);
  menuPanel.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item) return;
    const action = item.dataset.action;
    closeMenu();
    if (action === "newgame") newGame();
    else if (action === "draw1") { newGame(1); toast("1枚めくりに切り替えました"); }
    else if (action === "draw3") { newGame(3); toast("3枚めくりに切り替えました"); }
    else if (action === "howto") openModal("#howtoModal");
    else if (action === "resetstats") { saveStats({ gamesPlayed: 0, wins: 0, bestTime: null, bestScore: 0, bestMoves: null }); toast("記録をリセットしました"); }
    else if (action === "install") triggerInstall();
  });

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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") stopTimer();
    else if (!won) startTimer();
  });

  window.addEventListener("resize", () => {
    clearTimeout(window.__kasaneResizeT);
    window.__kasaneResizeT = setTimeout(relayout, 120);
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
    deferredPrompt.userChoice.finally(() => { deferredPrompt = null; installMenuItem.hidden = true; });
  }
  window.addEventListener("appinstalled", () => { installMenuItem.hidden = true; toast("インストールしました🃏"); });
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) installMenuItem.hidden = true;

  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update();
          document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update(); });
        })
        .catch((err) => console.warn("SW登録失敗", err));
    });
    let swRefreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || swRefreshed) return;
      swRefreshed = true;
      window.location.reload();
    });
  }

  /* ================= 初期化 ================= */
  createCardElements();
  computeCardSize();
  computeZoneRects();
  if (tryRestore()) {
    for (const suit of SUITS) zones.foundation[suit].forEach((c) => (c.faceUp = true));
    zones.waste.forEach((c) => (c.faceUp = true));
    startTimer();
    updateUndoButton();
    updateAutoButton();
    render(true);
  } else {
    newGame(drawMode);
  }
})();
