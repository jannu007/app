/* ===========================================================
   そろばん帳 — アプリロジック
   個人事業主・フリーランス向けのかんたん帳簿。
   すべてのデータは端末内 (localStorage) に保存されます。
   =========================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "soroban-cho:v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const toDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fmtYen = (n) => Math.round(n).toLocaleString("ja-JP");
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  const ACCOUNTS = {
    expense: ["仕入", "外注費", "通信費", "交通費", "消耗品費", "地代家賃", "水道光熱費", "接待交際費", "広告宣伝費", "支払手数料", "雑費"],
    income: ["売上", "雑収入"],
  };

  /* ---------------- データストア ---------------- */
  const Store = {
    data: { transactions: [] },

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.data = JSON.parse(raw);
      } catch (e) {
        console.warn("読み込みに失敗しました", e);
      }
      if (!Array.isArray(this.data.transactions)) this.data.transactions = [];
    },

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    },

    add(tx) {
      this.data.transactions.push(tx);
      this.save();
    },

    remove(id) {
      this.data.transactions = this.data.transactions.filter((t) => t.id !== id);
      this.save();
    },

    forMonth(year, month) {
      return this.data.transactions.filter((t) => {
        const [y, m] = t.date.split("-").map(Number);
        return y === year && m === month + 1;
      });
    },

    monthlyTotals(year, month) {
      const list = this.forMonth(year, month);
      let income = 0, expense = 0;
      for (const t of list) {
        if (t.kind === "income") income += t.amount;
        else expense += t.amount;
      }
      return { income, expense, profit: income - expense };
    },

    expenseByAccount(year, month) {
      const totals = {};
      for (const t of this.forMonth(year, month)) {
        if (t.kind !== "expense") continue;
        totals[t.account] = (totals[t.account] || 0) + t.amount;
      }
      return totals;
    },
  };

  Store.load();

  /* ---------------- 状態 ---------------- */
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-11
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

  /* ---------------- 月表示 ---------------- */
  function renderMonthLabel() {
    $("#monthText").textContent = `${viewYear}年 ${viewMonth + 1}月`;
    const sub = $("#monthSub");
    sub.textContent = (viewYear === today.getFullYear() && viewMonth === today.getMonth()) ? "今月" : "";
    $("#monthPicker").value = `${viewYear}-${pad2(viewMonth + 1)}`;
  }

  /* ---------------- 一覧・サマリー ---------------- */
  function renderAll() {
    renderMonthLabel();
    renderList();
    renderSummary();
  }

  function renderList() {
    const list = Store.forMonth(viewYear, viewMonth)
      .slice()
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const ul = $("#entryList");
    const empty = $("#emptyState");
    ul.innerHTML = "";

    if (list.length === 0) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      list.forEach((tx, i) => {
        const li = document.createElement("li");
        li.className = `entry-item ${tx.kind}`;
        li.style.animationDelay = `${Math.min(i * 30, 240)}ms`;
        const [, , d] = tx.date.split("-").map(Number);
        const wd = WEEKDAYS[new Date(tx.date).getDay()];
        li.innerHTML = `
          <span class="entry-kind-mark" aria-hidden="true"></span>
          <span class="entry-info">
            <span class="entry-name"></span><br />
            <span class="entry-account"></span><span class="entry-time">${pad2(d)}日（${wd}）</span>
          </span>
          <span class="entry-price"></span>
          <button class="entry-delete" aria-label="削除">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
          </button>
        `;
        li.querySelector(".entry-name").textContent = tx.memo || tx.account;
        li.querySelector(".entry-account").textContent = tx.account;
        li.querySelector(".entry-price").textContent = fmtYen(tx.amount) + "円";
        li.querySelector(".entry-delete").addEventListener("click", () => deleteTx(tx.id, li));
        ul.appendChild(li);
      });
    }
  }

  function deleteTx(id, li) {
    li.classList.add("removing");
    setTimeout(() => {
      Store.remove(id);
      renderList();
      renderSummary();
      toast("削除しました");
    }, 260);
  }

  function renderSummary() {
    const { income, expense, profit } = Store.monthlyTotals(viewYear, viewMonth);
    $("#incomeValue").textContent = fmtYen(income);
    $("#expenseValue").textContent = fmtYen(expense);
    $("#profitValue").textContent = fmtYen(profit);
    const profitEl = $("#profitValue").closest(".summary-value");
    profitEl.style.color = profit < 0 ? "rgb(var(--vermillion))" : profit > 0 ? "rgb(var(--matcha))" : "rgb(var(--indigo))";
  }

  /* ---------------- 月ナビ操作 ---------------- */
  function goToMonth(offset) {
    viewMonth += offset;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderAll();
  }

  $("#prevMonth").addEventListener("click", () => goToMonth(-1));
  $("#nextMonth").addEventListener("click", () => goToMonth(1));
  $("#monthDisplay").addEventListener("click", () => {
    $("#monthPicker").showPicker ? $("#monthPicker").showPicker() : $("#monthPicker").click();
  });
  $("#monthPicker").addEventListener("change", (e) => {
    if (!e.target.value) return;
    const [y, m] = e.target.value.split("-").map(Number);
    viewYear = y; viewMonth = m - 1;
    renderAll();
  });

  /* ---------------- 記帳モーダル ---------------- */
  const addModal = $("#addModal");
  const dateInput = $("#itemDate");
  const memoInput = $("#itemMemo");
  const amountInput = $("#itemAmount");
  const accountSelect = $("#itemAccount");

  function fillAccountOptions() {
    accountSelect.innerHTML = "";
    ACCOUNTS[selectedKind].forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      accountSelect.appendChild(opt);
    });
  }

  function defaultEntryDate() {
    if (viewYear === today.getFullYear() && viewMonth === today.getMonth()) return toDateKey(today);
    return `${viewYear}-${pad2(viewMonth + 1)}-01`;
  }

  function openAddModal() {
    addModal.hidden = false;
    dateInput.value = defaultEntryDate();
    memoInput.value = "";
    amountInput.value = "";
    selectedKind = "expense";
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.kind === "expense"));
    fillAccountOptions();
    document.body.style.overflow = "hidden";
    setTimeout(() => amountInput.focus(), 260);
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
    fillAccountOptions();
  });

  function submitTx() {
    const date = dateInput.value;
    const amount = Number(amountInput.value);
    if (!date) { toast("日付を選択してください"); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast("金額を正しく入力してください"); amountInput.focus(); return; }

    Store.add({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      kind: selectedKind,
      account: accountSelect.value,
      memo: memoInput.value.trim(),
      amount,
      time: new Date().toISOString(),
    });

    const [y, m] = date.split("-").map(Number);
    viewYear = y; viewMonth = m - 1;
    renderAll();
    closeAddModal();
    toast("記帳しました");
  }
  $("#submitBtn").addEventListener("click", submitTx);
  amountInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitTx(); });

  /* ---------------- 損益レポート モーダル ---------------- */
  const reportModal = $("#reportModal");
  const PALETTE = ["#3a5282", "#c4953f", "#b03a2e", "#5e8c7a", "#7a6650", "#8fa3b0", "#c77b45", "#5c729e", "#a15c9e", "#4d8f8b"];

  function openReportModal() {
    reportModal.hidden = false;
    document.body.style.overflow = "hidden";
    drawPie();
  }
  function closeReportModal() {
    reportModal.hidden = true;
    document.body.style.overflow = "";
  }
  $("#reportOpenBtn").addEventListener("click", openReportModal);
  $("#reportCloseBtn").addEventListener("click", closeReportModal);
  reportModal.addEventListener("click", (e) => { if (e.target === reportModal) closeReportModal(); });

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
    const totals = Store.expenseByAccount(viewYear, viewMonth);
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
    const duration = 700;
    const t0 = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let a = -Math.PI / 2;
      entries.forEach(([, val], i) => {
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
      const d = new Date(viewYear, viewMonth - i, 1);
      months.push(d);
    }
    const data = months.map((d) => Store.monthlyTotals(d.getFullYear(), d.getMonth()));
    const maxVal = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
    const padL = 30, padB = 26, padT = 14;
    const w = canvas.width - padL - 10, h = canvas.height - padB - padT;
    const groupW = w / months.length;

    const duration = 650, t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(90,90,120,0.25)";
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + h); ctx.lineTo(padL + w, padT + h);
      ctx.stroke();

      data.forEach((d, i) => {
        const gx = padL + i * groupW + groupW * 0.18;
        const barW = groupW * 0.28;
        const eH = (d.expense / maxVal) * h * eased;
        const iH = (d.income / maxVal) * h * eased;
        ctx.fillStyle = "#b03a2e";
        ctx.fillRect(gx, padT + h - eH, barW, eH);
        ctx.fillStyle = "#5e8c7a";
        ctx.fillRect(gx + barW + 4, padT + h - iH, barW, iH);

        ctx.fillStyle = "#6b6b84";
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
    if (action === "reset") resetData();
    if (action === "export-json") exportJson();
    if (action === "import-json") $("#importFile").click();
    if (action === "export-csv") exportCsv();
    if (action === "install") triggerInstall();
    setMenuOpen(false);
  });

  function resetData() {
    if (!confirm("すべての帳簿データを削除します。よろしいですか？")) return;
    Store.data = { transactions: [] };
    Store.save();
    renderAll();
    toast("すべて削除しました");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    downloadFile(`soroban-cho_${toDateKey(today)}.json`, JSON.stringify(Store.data, null, 2), "application/json");
    toast("JSONを書き出しました");
  }

  function exportCsv() {
    const rows = [["日付", "種別", "勘定科目", "摘要", "金額"]];
    Store.data.transactions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((t) => {
        rows.push([t.date, t.kind === "income" ? "収入" : "支出", t.account, t.memo || "", t.amount]);
      });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadFile(`soroban-cho_${toDateKey(today)}.csv`, "﻿" + csv, "text/csv");
    toast("CSVを書き出しました");
  }

  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.transactions)) throw new Error("invalid format");
        Store.data = parsed;
        Store.save();
        renderAll();
        toast("読み込みました");
      } catch (err) {
        toast("読み込みに失敗しました");
        console.warn(err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

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
    toast("インストールしました🧮");
  });

  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    installMenuItem.hidden = true;
  }

  if ("serviceWorker" in navigator) {
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
      if (swRefreshed) return;
      swRefreshed = true;
      window.location.reload();
    });
  }

  /* ---------------- 初期化 ---------------- */
  renderAll();
})();
