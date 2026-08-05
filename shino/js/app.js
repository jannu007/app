/* ===========================================================
   志野手帖 — アプリロジック
   すべてのデータは端末内 (localStorage) に保存されます。
   =========================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "shino-techo:v1";
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

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function fmtDate(key) {
    const d = fromKey(key);
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  }

  /* ---------------- データストア ---------------- */
  const defaultData = () => ({
    pieces: [],
    logs: [],
  });

  const Store = {
    data: defaultData(),

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.data = { ...defaultData(), ...JSON.parse(raw) };
      } catch (e) {
        console.warn("読み込みに失敗しました", e);
      }
      if (!this.data.pieces) this.data.pieces = [];
      if (!this.data.logs) this.data.logs = [];
    },

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    },

    addPiece(piece) { this.data.pieces.push(piece); this.save(); },
    updatePiece(id, patch) {
      const p = this.data.pieces.find((x) => x.id === id);
      if (p) Object.assign(p, patch);
      this.save();
    },
    removePiece(id) {
      this.data.pieces = this.data.pieces.filter((p) => p.id !== id);
      this.save();
    },

    addLog(entry) { this.data.logs.push(entry); this.save(); },
    removeLog(id) { this.data.logs = this.data.logs.filter((l) => l.id !== id); this.save(); },
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

  /* ---------------- 器の種類 ---------------- */
  const PIECE_TYPES = {
    chawan: { icon: "🍵", label: "茶碗・抹茶碗" },
    yunomi: { icon: "☕", label: "湯呑み・カップ" },
    guinomi: { icon: "🍶", label: "ぐい呑み・盃" },
    sara: { icon: "🍽", label: "皿・小皿" },
    hachi: { icon: "🥣", label: "鉢・小鉢" },
    kaki: { icon: "🌸", label: "花器" },
    other: { icon: "📦", label: "その他" },
  };
  const pieceTypeMeta = (t) => PIECE_TYPES[t] || PIECE_TYPES.other;

  /* ---------------- 季節のご提案 ---------------- */
  const SEASON_SUGGESTIONS = [
    { emblem: "🎍", text: "松の内が明けたら、まっさらな志野の茶碗で一年最初の一杯を。緋色の温かみが新春によく映えます。" },
    { emblem: "❄️", text: "寒さの厳しいこの時期は、熱燗をぐい呑みで。志野のぽってりとした厚みが手のひらを優しく温めてくれます。" },
    { emblem: "🌸", text: "桃の節句や春の訪れに、志野の小皿で彩り豊かな一品を。乳白の釉が春の食材を引き立てます。" },
    { emblem: "🌷", text: "お花見弁当やピクニックに、志野の小鉢を添えて。持ち歩く前に口縁の欠けがないか確認しておきましょう。" },
    { emblem: "🍵", text: "新茶の季節。志野の湯呑みでゆっくりと一服いかがですか。" },
    { emblem: "☔", text: "梅雨時は湿気がこもりやすい季節。使ったあとはしっかり乾かしてから収納しましょう。" },
    { emblem: "🎐", text: "そうめんや冷奴など、夏の食卓に志野の皿を。涼しげな乳白色が食欲をそそります。" },
    { emblem: "🌻", text: "冷たい麦茶やビールを志野のぐい呑みで。厚手の器は保冷効果も期待できます。" },
    { emblem: "🌰", text: "重陽の節句、栗ご飯やきのこ料理を志野の鉢に盛り付けて秋の始まりを楽しみましょう。" },
    { emblem: "🍁", text: "実りの秋。土物の温かみが増す季節、志野の茶碗で新米をよそってみませんか。" },
    { emblem: "🍂", text: "炉開きの季節。茶の湯を楽しむ方は、志野の茶碗の出番です。" },
    { emblem: "🎋", text: "一年の終わりに、お気に入りの器を並べてお屠蘇や年越しそばを。来年もよい景色が育ちますように。" },
  ];

  function renderSeason() {
    const m = new Date().getMonth();
    const s = SEASON_SUGGESTIONS[m];
    $("#seasonEmblem").textContent = s.emblem;
    $("#seasonText").textContent = s.text;
  }

  /* ---------------- ホーム ---------------- */
  function lastUsedInfo(pieceId) {
    const logs = Store.data.logs.filter((l) => l.pieceId === pieceId).sort((a, b) => b.date.localeCompare(a.date));
    return logs.length ? logs[0] : null;
  }

  function renderHome() {
    renderSeason();

    $("#statPieces").textContent = `${Store.data.pieces.length}点`;
    const pending = Store.data.pieces.filter((p) => !p.mizudome).length;
    $("#statMizudome").textContent = `${pending}点`;

    const logs = Store.data.logs.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const statRecent = $("#statRecent");
    if (logs.length === 0) {
      statRecent.textContent = "記録はまだありません";
    } else {
      const l = logs[0];
      statRecent.textContent = `${l.pieceName} ・ ${fmtDate(l.date)}`;
    }

    // 休ませているうつわ（3週間以上出番のないもの）
    const restCard = $("#restCard");
    const restList = $("#restList");
    restList.innerHTML = "";
    const now = Date.now();
    const REST_DAYS = 21;
    const entries = Store.data.pieces.map((p) => {
      const last = lastUsedInfo(p.id);
      const refKey = last ? last.date : (p.purchasedAt || p.createdAt);
      const days = Math.floor((now - fromKey(refKey).getTime()) / 86400000);
      return { piece: p, days, neverUsed: !last };
    }).filter((e) => e.days >= REST_DAYS).sort((a, b) => b.days - a.days).slice(0, 3);

    if (entries.length === 0) {
      restCard.hidden = true;
    } else {
      restCard.hidden = false;
      entries.forEach((e) => {
        const li = document.createElement("li");
        const label = e.neverUsed ? "まだ使われていません" : `${e.days}日使われていません`;
        li.innerHTML = `<span class="rest-name">${pieceTypeMeta(e.piece.type).icon} ${escapeHTML(e.piece.name)}</span><span class="rest-days">${label}</span>`;
        restList.appendChild(li);
      });
    }
  }

  /* ---------------- 器タブ ---------------- */
  function renderPieceTab() {
    const list = Store.data.pieces.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const ul = $("#pieceList");
    ul.innerHTML = "";
    $("#pieceEmpty").hidden = list.length !== 0;

    list.forEach((p, i) => {
      const meta = pieceTypeMeta(p.type);
      const last = lastUsedInfo(p.id);
      const li = document.createElement("li");
      li.className = "record-item";
      li.style.animationDelay = `${Math.min(i * 40, 240)}ms`;
      const subParts = [];
      if (p.kiln) subParts.push(escapeHTML(p.kiln));
      subParts.push(last ? `最終使用 ${fmtDate(last.date)}` : "未使用");
      li.innerHTML = `
        <span class="record-icon" aria-hidden="true">${meta.icon}</span>
        <span class="record-info">
          <span class="record-title">${escapeHTML(p.name)}</span>
          <span class="record-sub">${meta.label} ・ ${subParts.join(" ・ ")}</span>
        </span>
        <span class="record-side"><span class="mizudome-chip ${p.mizudome ? "" : "pending"}">${p.mizudome ? "目止め済み" : "目止め待ち"}</span></span>
      `;
      li.style.cursor = "pointer";
      li.addEventListener("click", () => openPieceModal(p.id));
      ul.appendChild(li);
    });
  }

  /* ---------------- 記録タブ ---------------- */
  function renderLogTab() {
    const list = Store.data.logs.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const ul = $("#logList");
    ul.innerHTML = "";
    $("#logEmpty").hidden = list.length !== 0;

    list.forEach((l, i) => {
      const piece = Store.data.pieces.find((p) => p.id === l.pieceId);
      const icon = piece ? pieceTypeMeta(piece.type).icon : "🏺";
      const li = document.createElement("li");
      li.className = "record-item";
      li.style.animationDelay = `${Math.min(i * 40, 240)}ms`;
      const titleParts = [l.pieceName];
      if (l.dish) titleParts.push(escapeHTML(l.dish));
      const subParts = [fmtDate(l.date)];
      if (l.memo) subParts.push(escapeHTML(l.memo));
      li.innerHTML = `
        <span class="record-icon" aria-hidden="true">${icon}</span>
        <span class="record-info">
          <span class="record-title">${titleParts.join(" ・ ")}</span>
          <span class="record-sub">${subParts.join(" ・ ")}</span>
        </span>
        <button class="record-delete" aria-label="削除">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
        </button>
      `;
      li.querySelector(".record-delete").addEventListener("click", () => {
        li.classList.add("removing");
        setTimeout(() => { Store.removeLog(l.id); renderAll(); toast("削除しました"); }, 240);
      });
      ul.appendChild(li);
    });
  }

  /* ---------------- 器 選択肢の更新 ---------------- */
  function refreshPieceOptions() {
    const sel = $("#logPiece");
    const current = sel.value;
    sel.innerHTML = '<option value="">選択してください</option>';
    Store.data.pieces.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${pieceTypeMeta(p.type).icon} ${p.name}`;
      sel.appendChild(opt);
    });
    if (Store.data.pieces.some((p) => p.id === current)) sel.value = current;
  }

  /* ---------------- 全体描画 ---------------- */
  function renderAll() {
    renderHome();
    renderPieceTab();
    renderLogTab();
    refreshPieceOptions();
  }

  /* ---------------- タブ切り替え ---------------- */
  $$(".tab-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn[data-tab]").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      $$(".tab-pane").forEach((pane) => {
        pane.hidden = pane.id !== `tab-${btn.dataset.tab}`;
      });
    });
  });

  /* ---------------- モーダル 開閉 ---------------- */
  let editingPieceId = null;

  function openPieceModal(pieceId) {
    editingPieceId = pieceId || null;
    const modal = $("#pieceModal");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const deleteBtn = $("#pieceDeleteBtn");
    if (editingPieceId) {
      const p = Store.data.pieces.find((x) => x.id === editingPieceId);
      $("#pieceModalTitle").textContent = "器を編集";
      $("#pieceName").value = p.name || "";
      $("#pieceType").value = p.type || "chawan";
      $("#pieceKiln").value = p.kiln || "";
      $("#pieceDate").value = p.purchasedAt || "";
      $("#pieceMizudome").checked = !!p.mizudome;
      $("#pieceNote").value = p.note || "";
      $("#pieceSubmitBtn").textContent = "変更を保存";
      deleteBtn.hidden = false;
    } else {
      $("#pieceModalTitle").textContent = "器を登録";
      $("#pieceName").value = "";
      $("#pieceType").value = "chawan";
      $("#pieceKiln").value = "";
      $("#pieceDate").value = "";
      $("#pieceMizudome").checked = false;
      $("#pieceNote").value = "";
      $("#pieceSubmitBtn").textContent = "登録する";
      deleteBtn.hidden = true;
    }
    setTimeout(() => $("#pieceName").focus(), 200);
  }

  function openModal(id) {
    if (id === "pieceModal") { openPieceModal(null); return; }
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (id === "logModal") {
      refreshPieceOptions();
      $("#logDate").value = todayKey();
      $("#logPiece").value = "";
      $("#logDish").value = "";
      $("#logMemo").value = "";
      setTimeout(() => $("#logPiece").focus(), 200);
    }
  }
  function closeModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    if (id === "pieceModal") editingPieceId = null;
  }

  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) openModal(openBtn.dataset.open);
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) closeModal(closeBtn.dataset.close);
    if (e.target.classList.contains("modal-overlay")) e.target.hidden = true;
  });

  /* ---------------- 器 登録・編集・削除 ---------------- */
  $("#pieceSubmitBtn").addEventListener("click", () => {
    const name = $("#pieceName").value.trim();
    if (!name) { toast("器の名前を入力してください"); $("#pieceName").focus(); return; }
    const patch = {
      name,
      type: $("#pieceType").value,
      kiln: $("#pieceKiln").value.trim(),
      purchasedAt: $("#pieceDate").value || null,
      mizudome: $("#pieceMizudome").checked,
      note: $("#pieceNote").value.trim(),
    };
    if (editingPieceId) {
      Store.updatePiece(editingPieceId, patch);
      toast("変更を保存しました");
    } else {
      Store.addPiece({ id: uid(), createdAt: todayKey(), ...patch });
      toast("器を登録しました");
    }
    renderAll();
    closeModal("pieceModal");
  });

  $("#pieceDeleteBtn").addEventListener("click", () => {
    if (!editingPieceId) return;
    if (!confirm("この器を削除します。使用記録は残ります。よろしいですか？")) return;
    Store.removePiece(editingPieceId);
    renderAll();
    closeModal("pieceModal");
    toast("器を削除しました");
  });

  /* ---------------- 使用記録 追加 ---------------- */
  $("#logSubmitBtn").addEventListener("click", () => {
    const pieceId = $("#logPiece").value;
    if (!pieceId) { toast("使った器を選択してください"); $("#logPiece").focus(); return; }
    const piece = Store.data.pieces.find((p) => p.id === pieceId);
    if (!piece) { toast("器が見つかりませんでした"); return; }
    const date = $("#logDate").value || todayKey();
    Store.addLog({
      id: uid(),
      date,
      pieceId,
      pieceName: piece.name,
      dish: $("#logDish").value.trim(),
      memo: $("#logMemo").value.trim(),
    });
    renderAll();
    closeModal("logModal");
    toast("記録しました");
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menuPanel.hidden) setMenuOpen(false);
  });

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
    a.download = `shino-techo-${todayKey()}.json`;
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
    if (!confirm("すべてのデータを削除します。よろしいですか？")) return;
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
    toast("インストールしました🏺");
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
