/* ===========================================================
   京の家計帖 — アプリロジック
   すべてのデータは端末内 (localStorage) に保存されます。
   =========================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "kyo-kakeicho:v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromKey = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtYen = (n) => n.toLocaleString("ja-JP");

  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  /* ---------------- データストア ---------------- */
  const Store = {
    data: { entries: {}, history: [] },

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.data = JSON.parse(raw);
      } catch (e) {
        console.warn("読み込みに失敗しました", e);
      }
      if (!this.data.entries) this.data.entries = {};
      if (!this.data.history) this.data.history = [];
    },

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    },

    entriesFor(dateKey) {
      return this.data.entries[dateKey] || [];
    },

    addEntry(dateKey, entry) {
      if (!this.data.entries[dateKey]) this.data.entries[dateKey] = [];
      this.data.entries[dateKey].push(entry);
      this.touchHistory(entry);
      this.save();
    },

    removeEntry(dateKey, id) {
      const list = this.data.entries[dateKey];
      if (!list) return;
      this.data.entries[dateKey] = list.filter((e) => e.id !== id);
      if (this.data.entries[dateKey].length === 0) delete this.data.entries[dateKey];
      this.save();
    },

    touchHistory(entry) {
      const existing = this.data.history.find(
        (h) => h.name === entry.name && h.kind === entry.kind
      );
      if (existing) {
        existing.price = entry.price;
        existing.count = (existing.count || 1) + 1;
        existing.lastUsed = Date.now();
      } else {
        this.data.history.unshift({
          name: entry.name,
          price: entry.price,
          kind: entry.kind,
          count: 1,
          lastUsed: Date.now(),
        });
      }
      this.data.history.sort((a, b) => (b.count - a.count) || (b.lastUsed - a.lastUsed));
      this.data.history = this.data.history.slice(0, 40);
    },

    totalsForMonth(year, month) {
      const totals = {};
      for (const key in this.data.entries) {
        const d = fromKey(key);
        if (d.getFullYear() === year && d.getMonth() === month) {
          for (const e of this.data.entries[key]) {
            if (e.kind !== "expense") continue;
            totals[e.name] = (totals[e.name] || 0) + e.price;
          }
        }
      }
      return totals;
    },

    monthlyNet(year, month) {
      let income = 0, expense = 0;
      for (const key in this.data.entries) {
        const d = fromKey(key);
        if (d.getFullYear() === year && d.getMonth() === month) {
          for (const e of this.data.entries[key]) {
            if (e.kind === "income") income += e.price;
            else expense += e.price;
          }
        }
      }
      return { income, expense, net: income - expense };
    },
  };

  Store.load();

  /* ---------------- 状態 ---------------- */
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  let selectedKind = "expense";

  /* ---------------- トースト ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------------- 日付表示 ---------------- */
  function renderDate(direction) {
    const key = toKey(currentDate);
    const el = $("#dateText");
    const wrap = $("#dateDisplay");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const apply = () => {
      el.textContent = `${currentDate.getFullYear()} / ${pad2(currentDate.getMonth() + 1)} / ${pad2(currentDate.getDate())}`;
      const wd = WEEKDAYS[currentDate.getDay()];
      const sub = $("#dateSub");
      if (currentDate.getTime() === today.getTime()) {
        sub.textContent = `本日（${wd}）`;
      } else {
        sub.textContent = `${wd}曜日`;
      }
      $("#datePicker").value = key;
    };

    if (direction && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const outAnim = direction === "next" ? "slideOutLeft" : "slideOutRight";
      const inAnim = direction === "next" ? "slideInLeft" : "slideInRight";
      el.style.animation = `${outAnim} .16s ${getComputedStyle(document.documentElement).getPropertyValue('--ease-brush') || 'ease'} forwards`;
      setTimeout(() => {
        apply();
        el.style.animation = `${inAnim} .28s cubic-bezier(.22,.9,.32,1)`;
      }, 150);
    } else {
      apply();
    }
  }

  /* ---------------- エントリー一覧 ---------------- */
  function renderEntries() {
    const key = toKey(currentDate);
    const list = Store.entriesFor(key).slice().sort((a, b) => a.time - b.time);
    const ul = $("#entryList");
    const empty = $("#emptyState");

    ul.innerHTML = "";
    if (list.length === 0) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      list.forEach((entry, i) => {
        const li = document.createElement("li");
        li.className = `entry-item ${entry.kind}`;
        li.style.animationDelay = `${Math.min(i * 40, 240)}ms`;
        const time = new Date(entry.time);
        li.innerHTML = `
          <span class="entry-kind-mark" aria-hidden="true"></span>
          <span class="entry-info">
            <span class="entry-name"></span><br />
            <span class="entry-time">${pad2(time.getHours())}:${pad2(time.getMinutes())}</span>
          </span>
          <span class="entry-price"></span>
          <button class="entry-delete" aria-label="削除">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
          </button>
        `;
        li.querySelector(".entry-name").textContent = entry.name;
        li.querySelector(".entry-price").textContent = fmtYen(entry.price) + "円";
        li.querySelector(".entry-delete").addEventListener("click", () => deleteEntry(key, entry.id, li));
        ul.appendChild(li);
      });
    }

    renderTotal(list);
  }

  function deleteEntry(dateKey, id, li) {
    li.classList.add("removing");
    setTimeout(() => {
      Store.removeEntry(dateKey, id);
      renderEntries();
      toast("削除しました");
    }, 260);
  }

  /* ---------------- 合計（カウントアップ） ---------------- */
  let totalAnimFrame = null;
  function renderTotal(list) {
    const net = list.reduce((sum, e) => sum + (e.kind === "income" ? e.price : -e.price), 0);
    const el = $("#totalValue");
    const from = Number(el.dataset.value || 0);
    const to = net;
    el.dataset.value = to;

    const valueRow = el.closest(".total-value");
    valueRow.style.color = to < 0 ? "rgb(var(--vermillion))" : to > 0 ? "rgb(var(--matcha))" : "rgb(var(--ink))";

    cancelAnimationFrame(totalAnimFrame);
    const duration = 420;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (to - from) * eased);
      el.textContent = fmtYen(val);
      if (t < 1) totalAnimFrame = requestAnimationFrame(step);
    }
    totalAnimFrame = requestAnimationFrame(step);
  }

  /* ---------------- 日付ナビ操作 ---------------- */
  function goToDay(offset) {
    currentDate.setDate(currentDate.getDate() + offset);
    renderDate(offset > 0 ? "next" : "prev");
    renderEntries();
  }

  $("#prevDay").addEventListener("click", () => goToDay(-1));
  $("#nextDay").addEventListener("click", () => goToDay(1));
  $("#dateDisplay").addEventListener("click", () => {
    $("#datePicker").showPicker ? $("#datePicker").showPicker() : $("#datePicker").click();
  });
  $("#datePicker").addEventListener("change", (e) => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    currentDate = new Date(y, m - 1, d);
    renderDate();
    renderEntries();
  });

  /* ---------------- スワイプで日付移動（左:翌日 / 右:前日） ---------------- */
  (function swipeNav() {
    const target = $(".app-shell");
    const LOCK_PX = 10;   // この移動量で縦/横どちらのジェスチャーか判定する
    const SWIPE_PX = 45;  // この移動量を超えたら日付を切り替える
    const SWIPE_MS = 800;
    let active = false;
    let axis = null; // "x" | "y" | null
    let startX = 0, startY = 0, startT = 0, curX = 0;

    // Pointer Eventsは端末によってジェスチャー中に pointercancel が誤発火することがあるため、
    // タッチ操作の判定には素の Touch Events を使う（マウス操作は別途ボタンハンドラで対応済み）
    target.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      active = true;
      axis = null;
      startX = curX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    }, { passive: true });

    target.addEventListener("touchmove", (e) => {
      if (!active || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      curX = x;
      const dx = x - startX;
      const dy = y - startY;
      if (axis === null && (Math.abs(dx) > LOCK_PX || Math.abs(dy) > LOCK_PX)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      }
      // 横スワイプと判定したら、縦スクロールに奪われないようブラウザの既定動作を止める
      if (axis === "x" && e.cancelable) e.preventDefault();
    }, { passive: false });

    target.addEventListener("touchend", () => {
      if (!active) return;
      active = false;
      const dx = curX - startX;
      const dt = Date.now() - startT;
      if (axis === "x" && dt < SWIPE_MS && Math.abs(dx) > SWIPE_PX) {
        goToDay(dx < 0 ? 1 : -1);
      }
      axis = null;
    });

    target.addEventListener("touchcancel", () => { active = false; axis = null; });
  })();

  /* ---------------- 追加モーダル ---------------- */
  const addModal = $("#addModal");
  const nameInput = $("#itemName");
  const priceInput = $("#itemPrice");

  function openAddModal() {
    addModal.hidden = false;
    nameInput.value = "";
    priceInput.value = "";
    selectedKind = "expense";
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.kind === "expense"));
    $("#historyChips").hidden = true;
    renderHistoryChips();
    document.body.style.overflow = "hidden";
    setTimeout(() => nameInput.focus(), 260);
  }
  function closeAddModal() {
    addModal.hidden = true;
    document.body.style.overflow = "";
  }

  $("#addOpenBtn").addEventListener("click", openAddModal);
  $("#cancelBtn").addEventListener("click", closeAddModal);
  addModal.addEventListener("click", (e) => { if (e.target === addModal) closeAddModal(); });

  $("#kindSegment").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    selectedKind = btn.dataset.kind;
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
  });

  function submitEntry() {
    const name = nameInput.value.trim();
    const price = Number(priceInput.value);
    if (!name) { toast("名前を入力してください"); nameInput.focus(); return; }
    if (!Number.isFinite(price) || price < 0) { toast("価格を正しく入力してください"); priceInput.focus(); return; }

    const key = toKey(currentDate);
    Store.addEntry(key, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      price,
      kind: selectedKind,
      time: Date.now(),
    });
    renderEntries();
    closeAddModal();
    toast(`「${name}」を追加しました`);
  }
  $("#submitBtn").addEventListener("click", submitEntry);
  priceInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitEntry(); });

  $("#historyToggle").addEventListener("click", () => {
    const chips = $("#historyChips");
    chips.hidden = !chips.hidden;
  });

  function renderHistoryChips() {
    const wrap = $("#historyChips");
    wrap.innerHTML = "";
    if (Store.data.history.length === 0) {
      wrap.innerHTML = `<p class="empty-state small" style="width:100%">まだ履歴がありません</p>`;
      return;
    }
    Store.data.history.forEach((h) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "history-chip";
      chip.innerHTML = `<span>${h.kind === "income" ? "💰" : "🍵"} ${h.name}</span><span class="chip-price">${fmtYen(h.price)}円</span>`;
      chip.addEventListener("click", () => {
        nameInput.value = h.name;
        priceInput.value = h.price;
        selectedKind = h.kind;
        $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.kind === h.kind));
        priceInput.focus();
      });
      wrap.appendChild(chip);
    });
  }

  /* ---------------- グラフモーダル ---------------- */
  const graphModal = $("#graphModal");
  const PALETTE = ["#b3203a", "#c79b40", "#5e8c7a", "#2b141a", "#e8a8b0", "#7a6650", "#8fa3b0", "#c77b45"];

  function openGraphModal() {
    graphModal.hidden = false;
    document.body.style.overflow = "hidden";
    drawPie();
  }
  function closeGraphModal() {
    graphModal.hidden = true;
    document.body.style.overflow = "";
  }
  $("#graphOpenBtn").addEventListener("click", openGraphModal);
  $("#graphCloseBtn").addEventListener("click", closeGraphModal);
  graphModal.addEventListener("click", (e) => { if (e.target === graphModal) closeGraphModal(); });

  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      const isMonth = btn.dataset.range === "month";
      $("#pieWrap").hidden = !isMonth;
      $("#barWrap").hidden = isMonth;
      if (isMonth) drawPie(); else drawBar();
    });
  });

  function drawPie() {
    const canvas = $("#pieChart");
    const ctx = canvas.getContext("2d");
    const totals = Store.totalsForMonth(currentDate.getFullYear(), currentDate.getMonth());
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const legend = $("#pieLegend");
    legend.innerHTML = "";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (entries.length === 0) {
      $("#pieEmpty").hidden = false;
      return;
    }
    $("#pieEmpty").hidden = true;

    const sum = entries.reduce((s, [, v]) => s + v, 0);
    const cx = canvas.width / 2, cy = canvas.height / 2, r = Math.min(cx, cy) - 12;
    let start = -Math.PI / 2;
    const duration = 700;
    const t0 = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let a = -Math.PI / 2;
      entries.forEach(([name, val], i) => {
        const slice = (val / sum) * Math.PI * 2 * eased;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a, a + slice);
        ctx.closePath();
        ctx.fillStyle = PALETTE[i % PALETTE.length];
        ctx.fill();
        a += slice;
      });
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#f6efe1";
      ctx.fillStyle = "rgb(" + getComputedStyle(document.documentElement).getPropertyValue("--card-bg") + ")";
      ctx.fill();
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    entries.forEach(([name, val], i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="legend-dot" style="background:${PALETTE[i % PALETTE.length]}"></span><span class="legend-name">${name}</span><span class="legend-amt">${fmtYen(val)}円</span>`;
      legend.appendChild(li);
    });
  }

  function drawBar() {
    const canvas = $("#barChart");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      months.push(d);
    }
    const data = months.map((d) => Store.monthlyNet(d.getFullYear(), d.getMonth()));
    const maxVal = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
    const padL = 30, padB = 26, padT = 14;
    const w = canvas.width - padL - 10, h = canvas.height - padB - padT;
    const groupW = w / months.length;

    ctx.strokeStyle = "rgba(120,100,70,0.25)";
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + h); ctx.lineTo(padL + w, padT + h);
    ctx.stroke();

    const duration = 650, t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(120,100,70,0.25)";
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + h); ctx.lineTo(padL + w, padT + h);
      ctx.stroke();

      data.forEach((d, i) => {
        const gx = padL + i * groupW + groupW * 0.18;
        const barW = groupW * 0.28;
        const eH = (d.expense / maxVal) * h * eased;
        const iH = (d.income / maxVal) * h * eased;
        ctx.fillStyle = "#b3203a";
        ctx.fillRect(gx, padT + h - eH, barW, eH);
        ctx.fillStyle = "#5e8c7a";
        ctx.fillRect(gx + barW + 4, padT + h - iH, barW, iH);

        ctx.fillStyle = "rgb(var(--ink-soft))";
        ctx.fillStyle = "#6b5c4e";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${months[i].getMonth() + 1}月`, gx + barW + 2, padT + h + 16);
      });
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- メニュー（書き出し/読み込み/削除） ---------------- */
  const menuBtn = $("#menuBtn");
  const menuPanel = $("#menuPanel");
  const menuScrim = $("#menuScrim");

  function setMenuOpen(open) {
    menuPanel.hidden = !open;
    menuScrim.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
  }

  menuBtn.addEventListener("click", () => setMenuOpen(menuPanel.hidden));
  menuScrim.addEventListener("click", () => setMenuOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menuPanel.hidden) setMenuOpen(false);
  });

  menuPanel.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-item");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "export") exportData();
    if (action === "reset") resetData();
    if (action === "install") triggerInstall();
    setMenuOpen(false);
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kyo-kakeicho_${toKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("書き出しました");
  }

  function resetData() {
    if (!confirm("すべての家計簿データを削除します。よろしいですか？")) return;
    Store.data = { entries: {}, history: [] };
    Store.save();
    renderEntries();
    toast("すべて削除しました");
  }

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

  /* ---------------- 桜の花びら（モーショングラフィックス） ---------------- */
  (function petals() {
    const canvas = $("#petals");
    const ctx = canvas.getContext("2d");
    let w, h, petalsArr = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      w = canvas.width = window.innerWidth * devicePixelRatio;
      h = canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    // 雅（みやび）を意識し、控えめで邪魔にならない花びらに調整
    // (帳面カード類より背面に描画され、隙間にだけ淡く見える)
    const PETAL_COLORS = ["#e8a8b0", "#d7b98f"]; // 桜色・淡い金
    function makePetal() {
      return {
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.3,
        size: (4 + Math.random() * 5) * devicePixelRatio,
        speedY: (0.16 + Math.random() * 0.22) * devicePixelRatio,
        speedX: (Math.random() - 0.5) * 0.3 * devicePixelRatio,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.015,
        sway: Math.random() * Math.PI * 2,
        opacity: 0.18 + Math.random() * 0.2,
        color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
      };
    }

    const COUNT = reduced ? 0 : (window.innerWidth < 480 ? 5 : 8);
    for (let i = 0; i < COUNT; i++) {
      const p = makePetal();
      p.y = Math.random() * h;
      petalsArr.push(p);
    }

    function drawPetal(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      petalsArr.forEach((p) => {
        p.y += p.speedY;
        p.sway += 0.012;
        p.x += p.speedX + Math.sin(p.sway) * 0.25 * devicePixelRatio;
        p.rot += p.rotSpeed;
        if (p.y > h + 20) {
          Object.assign(p, makePetal());
          p.y = -20;
        }
        drawPetal(p);
      });
      requestAnimationFrame(tick);
    }
    if (!reduced) requestAnimationFrame(tick);
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
    toast("インストールしました🌸");
  });

  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    installMenuItem.hidden = true;
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      // updateViaCache:"none" でsw.js自体もブラウザのHTTPキャッシュを経由させない
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update();
          // アプリをホーム画面から開き直した際（ページ遷移を伴わない復帰）にも
          // 更新チェックを行う
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update();
          });
        })
        .catch((err) => console.warn("SW登録失敗", err));
    });
    // 新しいバージョンが有効化されたら、最新のコードを確実に反映するため自動で1度だけ再読み込みする
    let swRefreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (swRefreshed) return;
      swRefreshed = true;
      window.location.reload();
    });
  }

  /* ---------------- 初期化 ---------------- */
  renderDate();
  renderEntries();
})();
