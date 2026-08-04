/* ===========================================================
   こよみ手帖 — アプリロジック
   すべてのデータは端末内 (localStorage) に保存されます。
   =========================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "koyomi-techo:v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromKey = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const todayKey = () => toKey(new Date());
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const COLORS = ["#c0483e", "#c97830", "#b98f2e", "#5b8a4c", "#3d8079", "#4569a0", "#71589c", "#a85580"];

  /* ---------------- データストア ---------------- */
  const defaultData = () => ({ events: [] });

  const Store = {
    data: defaultData(),
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.data = { ...defaultData(), ...JSON.parse(raw) };
      } catch (e) {
        console.warn("読み込みに失敗しました", e);
      }
      if (!this.data.events) this.data.events = [];
    },
    save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); },
    forDate(key) { return this.data.events.filter((e) => e.date === key); },
    add(entry) { this.data.events.push(entry); this.save(); },
    update(id, patch) {
      const e = this.data.events.find((e) => e.id === id);
      if (e) Object.assign(e, patch);
      this.save();
    },
    remove(id) { this.data.events = this.data.events.filter((e) => e.id !== id); this.save(); },
  };
  Store.load();

  /* ---------------- トースト ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------------- 並び替え ---------------- */
  function sortDayEntries(list) {
    return list.slice().sort((a, b) => {
      const rank = (e) => (e.type === "event" && e.allDay ? 0 : e.type === "event" ? 1 : 2);
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 1) return (a.start || "").localeCompare(b.start || "");
      if (ra === 2) return (a.done === b.done ? 0 : a.done ? 1 : -1) || a.title.localeCompare(b.title, "ja");
      return a.title.localeCompare(b.title, "ja");
    });
  }

  /* ---------------- 状態 ---------------- */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = new Date(today);

  /* ---------------- カレンダー描画 ---------------- */
  function renderCalendar() {
    $("#monthText").textContent = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
    $("#monthPicker").value = `${currentMonth.getFullYear()}-${pad2(currentMonth.getMonth() + 1)}`;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const selectedKey = toKey(selectedDate);
    const grid = $("#calendarGrid");
    grid.innerHTML = "";

    for (let i = 0; i < totalCells; i++) {
      const dayOffset = i - firstWeekday + 1;
      const cellDate = new Date(year, month, dayOffset);
      const key = toKey(cellDate);
      const isOtherMonth = cellDate.getMonth() !== month;
      const isToday = key === todayKey();
      const isSelected = key === selectedKey;
      const wd = cellDate.getDay();

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `day-cell${isOtherMonth ? " other-month" : ""}${isToday ? " today" : ""}${isSelected ? " selected" : ""}`;
      cell.dataset.date = key;

      const numClass = wd === 0 ? "sun" : wd === 6 ? "sat" : "";
      const numHTML = isToday
        ? `<span class="day-num ${numClass}"><span class="day-num-inner">${cellDate.getDate()}</span></span>`
        : `<span class="day-num ${numClass}">${cellDate.getDate()}</span>`;

      const entries = sortDayEntries(Store.forDate(key));
      const MAX_BARS = 3;
      const bars = entries.slice(0, MAX_BARS).map((e) => {
        const doneClass = e.type === "task" && e.done ? " done" : "";
        const label = e.type === "event" && !e.allDay && e.start ? `${e.start} ${e.title}` : e.title;
        return `<span class="event-bar${e.type === "task" ? " task" + doneClass : ""}" style="background:${e.color}">${escapeHTML(label)}</span>`;
      }).join("");
      const more = entries.length > MAX_BARS ? `<span class="event-more">+${entries.length - MAX_BARS}件</span>` : "";

      cell.innerHTML = `${numHTML}<span class="day-events">${bars}${more}</span>`;
      cell.addEventListener("click", () => {
        selectedDate = new Date(cellDate);
        if (isOtherMonth) currentMonth = new Date(cellDate.getFullYear(), cellDate.getMonth(), 1);
        renderAll();
      });
      grid.appendChild(cell);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- アジェンダ描画 ---------------- */
  function renderAgenda() {
    const key = toKey(selectedDate);
    $("#agendaDate").textContent = `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日（${WEEKDAYS[selectedDate.getDay()]}）`;

    const list = sortDayEntries(Store.forDate(key));
    const ul = $("#agendaList");
    ul.innerHTML = "";
    $("#agendaEmpty").hidden = list.length !== 0;

    list.forEach((entry, i) => {
      const li = document.createElement("li");
      li.className = "agenda-item";
      li.style.animationDelay = `${Math.min(i * 35, 210)}ms`;

      let timeLabel = "";
      if (entry.type === "event") timeLabel = entry.allDay ? "終日" : entry.start ? `${entry.start}${entry.end ? "〜" + entry.end : ""}` : "";

      const checkHTML = entry.type === "task"
        ? `<button type="button" class="agenda-check${entry.done ? " done" : ""}" aria-label="完了にする">${entry.done ? "✓" : ""}</button>`
        : `<span class="agenda-color" style="background:${entry.color}"></span>`;

      li.innerHTML = `
        ${checkHTML}
        <span class="agenda-body">
          ${timeLabel ? `<span class="agenda-time">${escapeHTML(timeLabel)}</span>` : ""}
          <span class="agenda-title${entry.type === "task" && entry.done ? " done" : ""}">${escapeHTML(entry.title)}</span>
          ${entry.memo ? `<span class="agenda-memo">${escapeHTML(entry.memo)}</span>` : ""}
        </span>
        <button class="agenda-delete" aria-label="削除">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
        </button>
      `;

      li.querySelector(".agenda-body").addEventListener("click", () => openEventModal(entry));
      if (entry.type === "task") {
        li.querySelector(".agenda-check").addEventListener("click", (ev) => {
          ev.stopPropagation();
          Store.update(entry.id, { done: !entry.done });
          renderAll();
        });
      }
      li.querySelector(".agenda-delete").addEventListener("click", (ev) => {
        ev.stopPropagation();
        li.classList.add("removing");
        setTimeout(() => { Store.remove(entry.id); renderAll(); toast("削除しました"); }, 240);
      });
      ul.appendChild(li);
    });
  }

  function renderAll() { renderCalendar(); renderAgenda(); }

  /* ---------------- 月ナビ ---------------- */
  function clampSelectedToMonth() {
    const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const day = Math.min(selectedDate.getDate(), daysInMonth);
    selectedDate = new Date(y, m, day);
  }

  function goToMonth(offset) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    clampSelectedToMonth();
    renderAll();
  }

  $("#prevMonth").addEventListener("click", () => goToMonth(-1));
  $("#nextMonth").addEventListener("click", () => goToMonth(1));
  $("#todayBtn").addEventListener("click", () => {
    currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDate = new Date(today);
    renderAll();
  });
  $("#monthDisplay").addEventListener("click", () => {
    $("#monthPicker").showPicker ? $("#monthPicker").showPicker() : $("#monthPicker").click();
  });
  $("#monthPicker").addEventListener("change", (e) => {
    if (!e.target.value) return;
    const [y, m] = e.target.value.split("-").map(Number);
    currentMonth = new Date(y, m - 1, 1);
    clampSelectedToMonth();
    renderAll();
  });

  /* ---------------- スワイプで月移動 ---------------- */
  (function swipeNav() {
    const target = $(".calendar-card");
    const LOCK_PX = 10, SWIPE_PX = 45, SWIPE_MS = 800;
    let active = false, axis = null, startX = 0, startY = 0, startT = 0, curX = 0;

    target.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      active = true; axis = null;
      startX = curX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    }, { passive: true });

    target.addEventListener("touchmove", (e) => {
      if (!active || e.touches.length !== 1) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      curX = x;
      const dx = x - startX, dy = y - startY;
      if (axis === null && (Math.abs(dx) > LOCK_PX || Math.abs(dy) > LOCK_PX)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      }
      if (axis === "x" && e.cancelable) e.preventDefault();
    }, { passive: false });

    target.addEventListener("touchend", () => {
      if (!active) return;
      active = false;
      const dx = curX - startX, dt = Date.now() - startT;
      if (axis === "x" && dt < SWIPE_MS && Math.abs(dx) > SWIPE_PX) goToMonth(dx < 0 ? 1 : -1);
      axis = null;
    });
    target.addEventListener("touchcancel", () => { active = false; axis = null; });
  })();

  /* ---------------- 色ピッカー ---------------- */
  let selectedColor = COLORS[0];
  function buildColorPicker() {
    const wrap = $("#colorPicker");
    wrap.innerHTML = "";
    COLORS.forEach((c) => {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "color-swatch";
      sw.style.background = c;
      sw.dataset.color = c;
      sw.setAttribute("aria-label", "色を選択");
      sw.addEventListener("click", () => setSelectedColor(c));
      wrap.appendChild(sw);
    });
  }
  function setSelectedColor(c) {
    selectedColor = c;
    $$(".color-swatch").forEach((sw) => sw.classList.toggle("active", sw.dataset.color === c));
  }
  buildColorPicker();

  /* ---------------- モーダル ---------------- */
  const eventModal = $("#eventModal");
  let editingId = null;
  let selectedType = "event";

  function setType(type) {
    selectedType = type;
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    $("#allDayField").hidden = type === "task";
    updateTimeFieldsVisibility();
  }
  function updateTimeFieldsVisibility() {
    $("#timeFields").hidden = selectedType === "task" || $("#eventAllDay").checked;
  }
  $("#typeSegment").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    setType(btn.dataset.type);
  });
  $("#eventAllDay").addEventListener("change", updateTimeFieldsVisibility);

  function openEventModal(entry) {
    editingId = entry ? entry.id : null;
    $("#eventModalTitle").textContent = entry ? (entry.type === "task" ? "タスクを編集" : "予定を編集") : "予定を追加";
    $("#eventDeleteBtn").hidden = !entry;

    setType(entry ? entry.type : "event");
    $("#eventTitle").value = entry ? entry.title : "";
    $("#eventDate").value = entry ? entry.date : toKey(selectedDate);
    $("#eventAllDay").checked = entry ? !!entry.allDay : false;
    $("#eventStart").value = entry && entry.start ? entry.start : "";
    $("#eventEnd").value = entry && entry.end ? entry.end : "";
    $("#eventMemo").value = entry ? entry.memo || "" : "";
    setSelectedColor(entry ? entry.color : COLORS[0]);
    updateTimeFieldsVisibility();

    eventModal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("#eventTitle").focus(), 200);
  }
  function closeEventModal() {
    eventModal.hidden = true;
    document.body.style.overflow = "";
  }

  $("#addEventBtn").addEventListener("click", () => openEventModal(null));
  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) closeEventModal();
    if (e.target === eventModal) closeEventModal();
  });

  $("#eventSubmitBtn").addEventListener("click", () => {
    const title = $("#eventTitle").value.trim();
    if (!title) { toast("タイトルを入力してください"); $("#eventTitle").focus(); return; }
    const date = $("#eventDate").value;
    if (!date) { toast("日付を入力してください"); return; }

    const allDay = selectedType === "event" && $("#eventAllDay").checked;
    const start = selectedType === "event" && !allDay ? $("#eventStart").value : "";
    if (selectedType === "event" && !allDay && !start) { toast("開始時刻を入力してください"); $("#eventStart").focus(); return; }
    const end = selectedType === "event" && !allDay ? $("#eventEnd").value : "";

    const payload = {
      type: selectedType,
      title,
      date,
      allDay,
      start: start || null,
      end: end || null,
      color: selectedColor,
      memo: $("#eventMemo").value.trim(),
    };

    if (editingId) {
      Store.update(editingId, payload);
      toast("更新しました");
    } else {
      Store.add({ id: uid(), done: false, ...payload });
      toast(selectedType === "task" ? "タスクを追加しました" : "予定を追加しました");
    }
    selectedDate = fromKey(date);
    currentMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderAll();
    closeEventModal();
  });

  $("#eventDeleteBtn").addEventListener("click", () => {
    if (!editingId) return;
    if (!confirm("この予定を削除します。よろしいですか？")) return;
    Store.remove(editingId);
    renderAll();
    closeEventModal();
    toast("削除しました");
  });

  /* ---------------- メニュー ---------------- */
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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menuPanel.hidden) setMenuOpen(false); });

  menuPanel.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-item");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "export") exportData();
    if (action === "import") $("#importFile").click();
    if (action === "reset") resetData();
    if (action === "install") triggerInstall();
    setMenuOpen(false);
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `koyomi-techo-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("データを書き出しました");
  }

  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        Store.data = { ...defaultData(), ...parsed };
        Store.save();
        renderAll();
        toast("データを読み込みました");
      } catch (err) {
        toast("読み込みに失敗しました");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  function resetData() {
    if (!confirm("すべての予定・タスクを削除します。よろしいですか？")) return;
    Store.data = defaultData();
    Store.save();
    renderAll();
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
    toast("インストールしました🗓️");
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

  /* ---------------- 初期化 ---------------- */
  renderAll();
})();
