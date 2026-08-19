/* ===========================================================
   QR早見帖 — アプリロジック
   QRコードの読み取り・作成はすべて端末内（このブラウザ）だけで処理されます。
   読み取りは jsQR、作成は qrcode-generator を使用（いずれもCDN不使用・同梱）。
   =========================================================== */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const HISTORY_KEY = "qr-hayamicho-history-v1";
  const HISTORY_LIMIT = 200;

  /* ---------------- トースト ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  }

  /* ---------------- タブ切り替え ---------------- */
  const tabBtns = $$(".tab-btn");
  const tabPanels = {
    scan: $("#panel-scan"),
    history: $("#panel-history"),
    create: $("#panel-create"),
  };
  function setTab(name) {
    tabBtns.forEach((b) => {
      const active = b.dataset.tab === name;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    Object.entries(tabPanels).forEach(([key, el]) => { el.hidden = key !== name; });
    if (name === "history") renderHistory();
    if (name !== "scan") stopCamera();
  }
  tabBtns.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

  /* ===========================================================
     ペイロード判定（URL / メール / 電話 / SMS / Wi-Fi / 連絡先 / テキスト）
     =========================================================== */
  function parseEscapedFields(payload) {
    // WIFI: / MECARD: 形式（\; \, \: \\ のエスケープに対応した簡易パーサー）
    const fields = {};
    let cur = "";
    let key = null;
    for (let i = 0; i < payload.length; i++) {
      const c = payload[i];
      if (c === "\\" && i + 1 < payload.length) {
        cur += payload[i + 1];
        i++;
        continue;
      }
      if (c === ":" && key === null) {
        key = cur;
        cur = "";
        continue;
      }
      if (c === ";") {
        if (key !== null) fields[key] = cur;
        key = null;
        cur = "";
        continue;
      }
      cur += c;
    }
    return fields;
  }

  function classifyPayload(text) {
    const trimmed = text.trim();

    if (/^https?:\/\//i.test(trimmed)) {
      return { type: "url", label: "URL", icon: "🔗", text: trimmed };
    }
    if (/^mailto:/i.test(trimmed)) {
      return { type: "email", label: "メール", icon: "✉️", text: trimmed, address: trimmed.replace(/^mailto:/i, "").split("?")[0] };
    }
    if (/^tel:/i.test(trimmed)) {
      return { type: "tel", label: "電話番号", icon: "📞", text: trimmed, number: trimmed.replace(/^tel:/i, "") };
    }
    if (/^sms(to)?:/i.test(trimmed)) {
      return { type: "sms", label: "SMS", icon: "💬", text: trimmed, number: trimmed.replace(/^smsto?:/i, "").split(":")[0] };
    }
    if (/^WIFI:/i.test(trimmed)) {
      const fields = parseEscapedFields(trimmed.replace(/^WIFI:/i, ""));
      return {
        type: "wifi",
        label: "Wi-Fi",
        icon: "📶",
        text: trimmed,
        ssid: fields.S || "",
        password: fields.P || "",
        security: fields.T || "",
        hidden: fields.H === "true",
      };
    }
    if (/^MECARD:/i.test(trimmed)) {
      const fields = parseEscapedFields(trimmed.replace(/^MECARD:/i, ""));
      return {
        type: "contact",
        label: "連絡先",
        icon: "🪪",
        text: trimmed,
        name: fields.N || "",
        tel: fields.TEL || "",
        email: fields.EMAIL || "",
      };
    }
    if (/^BEGIN:VCARD/i.test(trimmed)) {
      const nameMatch = trimmed.match(/FN:(.+)/i) || trimmed.match(/N:(.+)/i);
      const telMatch = trimmed.match(/TEL[^:]*:(.+)/i);
      const emailMatch = trimmed.match(/EMAIL[^:]*:(.+)/i);
      return {
        type: "contact",
        label: "連絡先",
        icon: "🪪",
        text: trimmed,
        name: nameMatch ? nameMatch[1].trim() : "",
        tel: telMatch ? telMatch[1].trim() : "",
        email: emailMatch ? emailMatch[1].trim() : "",
      };
    }
    return { type: "text", label: "テキスト", icon: "📝", text: trimmed };
  }

  function renderResultActions(info) {
    const actions = [];
    switch (info.type) {
      case "url":
        actions.push({ label: "🔗 開く", primary: true, handler: () => window.open(info.text, "_blank", "noopener") });
        actions.push({ label: "コピー", handler: () => copyText(info.text) });
        break;
      case "email":
        actions.push({ label: "✉️ メールを作成", primary: true, handler: () => { location.href = info.text; } });
        actions.push({ label: "コピー", handler: () => copyText(info.address) });
        break;
      case "tel":
        actions.push({ label: "📞 発信する", primary: true, handler: () => { location.href = info.text; } });
        actions.push({ label: "コピー", handler: () => copyText(info.number) });
        break;
      case "sms":
        actions.push({ label: "💬 SMSを作成", primary: true, handler: () => { location.href = info.text; } });
        actions.push({ label: "コピー", handler: () => copyText(info.number) });
        break;
      case "wifi":
        if (info.ssid) actions.push({ label: "SSIDをコピー", handler: () => copyText(info.ssid) });
        if (info.password) actions.push({ label: "パスワードをコピー", primary: true, handler: () => copyText(info.password) });
        break;
      case "contact":
        if (info.tel) actions.push({ label: "📞 発信する", primary: true, handler: () => { location.href = "tel:" + info.tel; } });
        if (info.email) actions.push({ label: "✉️ メール", handler: () => { location.href = "mailto:" + info.email; } });
        actions.push({ label: "コピー", handler: () => copyText(info.text) });
        break;
      default:
        actions.push({ label: "コピー", primary: true, handler: () => copyText(info.text) });
        break;
    }
    return actions;
  }

  function showResult(rawText, { fromHistory = false } = {}) {
    const info = classifyPayload(rawText);

    $("#resultTypeBadge").textContent = `${info.icon} ${info.label}`;

    const body = $("#resultBody");
    body.innerHTML = "";
    if (info.type === "wifi") {
      const dl = document.createElement("dl");
      dl.innerHTML = `
        <dt>SSID</dt><dd>${escapeHtml(info.ssid || "(不明)")}</dd>
        <dt>パスワード</dt><dd>${escapeHtml(info.password || "(なし)")}</dd>
        <dt>暗号化方式</dt><dd>${escapeHtml(info.security || "(不明)")}</dd>
      `;
      body.appendChild(dl);
    } else if (info.type === "contact") {
      const dl = document.createElement("dl");
      dl.innerHTML = `
        <dt>名前</dt><dd>${escapeHtml(info.name || "(不明)")}</dd>
        <dt>電話</dt><dd>${escapeHtml(info.tel || "(なし)")}</dd>
        <dt>メール</dt><dd>${escapeHtml(info.email || "(なし)")}</dd>
      `;
      body.appendChild(dl);
    } else {
      body.textContent = info.text;
    }

    const actionsWrap = $("#resultActions");
    actionsWrap.innerHTML = "";
    renderResultActions(info).forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn " + (a.primary ? "btn-primary" : "btn-secondary") + " small";
      btn.textContent = a.label;
      btn.addEventListener("click", a.handler);
      actionsWrap.appendChild(btn);
    });

    $("#resultCard").hidden = false;
    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" });

    if (!fromHistory) {
      addHistory(rawText, info.type);
      toast("QRコードを読み取りました");
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  $("#resultCloseBtn").addEventListener("click", () => { $("#resultCard").hidden = true; });
  $("#scanAgainBtn").addEventListener("click", () => {
    $("#resultCard").hidden = true;
    detectionPaused = false;
    if (!stream) startCamera();
  });

  /* ===========================================================
     カメラスキャン
     =========================================================== */
  const video = $("#scanVideo");
  const scanCanvas = $("#scanCanvas");
  const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });

  let stream = null;
  let rafId = null;
  let detectionPaused = false;
  let videoDevices = [];
  let currentDeviceIndex = 0;

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("このブラウザはカメラ利用に対応していません");
      return;
    }
    $("#scanIdle").hidden = true;
    $("#scanViewport").hidden = false;
    $("#scanStatus").textContent = "QRコードを枠内に収めてください";
    detectionPaused = false;

    const constraints = videoDevices.length
      ? { video: { deviceId: { exact: videoDevices[currentDeviceIndex].deviceId } } }
      : { video: { facingMode: { ideal: "environment" } } };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      toast(err && err.name === "NotAllowedError" ? "カメラの利用が許可されませんでした" : "カメラを起動できませんでした");
      stopCamera();
      return;
    }

    video.srcObject = stream;
    await video.play();

    if (!videoDevices.length) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter((d) => d.kind === "videoinput");
        $("#switchCameraBtn").hidden = videoDevices.length < 2;
      } catch { /* デバイス一覧が取得できなくても続行 */ }
    }

    rafId = requestAnimationFrame(scanLoop);
  }

  function stopCamera() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    $("#scanViewport").hidden = true;
    $("#scanIdle").hidden = false;
  }

  function scanLoop() {
    if (!stream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && !detectionPaused) {
      scanCanvas.width = video.videoWidth;
      scanCanvas.height = video.videoHeight;
      scanCtx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
      const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
      if (code && code.data) {
        detectionPaused = true;
        $("#scanStatus").textContent = "読み取りました！";
        if (navigator.vibrate) navigator.vibrate(60);
        showResult(code.data);
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  $("#startCameraBtn").addEventListener("click", startCamera);
  $("#stopCameraBtn").addEventListener("click", stopCamera);
  $("#switchCameraBtn").addEventListener("click", async () => {
    if (videoDevices.length < 2) return;
    currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    await startCamera();
  });

  /* ===========================================================
     画像ファイルから読み取り
     =========================================================== */
  const dropZone = $("#dropZone");
  const fileInput = $("#fileInput");

  function decodeImageFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      toast("画像ファイルを選んでください");
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
      URL.revokeObjectURL(url);
      if (code && code.data) {
        showResult(code.data);
      } else {
        toast("QRコードが見つかりませんでした");
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("画像を読み込めませんでした"); };
    img.src = url;
  }

  $("#pickFileBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) decodeImageFile(fileInput.files[0]);
    fileInput.value = "";
  });
  dropZone.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    fileInput.click();
  });
  ["dragover", "dragenter"].forEach((ev) => dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  }));
  ["dragleave", "dragend"].forEach((ev) => dropZone.addEventListener(ev, () => dropZone.classList.remove("drag-over")));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) decodeImageFile(file);
  });

  /* ===========================================================
     履歴
     =========================================================== */
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveHistory(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  }
  function addHistory(text, type) {
    const list = loadHistory();
    list.unshift({ id: Date.now() + Math.random().toString(36).slice(2), text, type, ts: Date.now() });
    saveHistory(list);
  }
  function deleteHistory(id) {
    saveHistory(loadHistory().filter((h) => h.id !== id));
    renderHistory();
  }

  const typeIcons = { url: "🔗", email: "✉️", tel: "📞", sms: "💬", wifi: "📶", contact: "🪪", text: "📝" };

  function renderHistory() {
    const list = loadHistory();
    const ul = $("#historyList");
    ul.innerHTML = "";
    $("#historyEmpty").hidden = list.length > 0;

    list.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item";
      const date = new Date(item.ts);
      li.innerHTML = `
        <span class="history-icon" aria-hidden="true">${typeIcons[item.type] || "📝"}</span>
        <span class="history-main">
          <p class="history-text"></p>
          <p class="history-meta">${date.toLocaleString("ja-JP")}</p>
        </span>
        <span class="history-actions">
          <button type="button" class="history-mini-btn" data-act="copy" title="コピー">📋</button>
          <button type="button" class="history-mini-btn danger" data-act="delete" title="削除">🗑</button>
        </span>
      `;
      li.querySelector(".history-text").textContent = item.text;
      li.querySelector('[data-act="copy"]').addEventListener("click", () => copyText(item.text));
      li.querySelector('[data-act="delete"]').addEventListener("click", () => deleteHistory(item.id));
      li.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        setTab("scan");
        showResult(item.text, { fromHistory: true });
      });
      ul.appendChild(li);
    });
  }

  $("#clearHistoryBtn").addEventListener("click", () => {
    if (!loadHistory().length) { toast("履歴はありません"); return; }
    if (!confirm("読み取り履歴をすべて削除しますか？")) return;
    saveHistory([]);
    renderHistory();
    toast("履歴を削除しました");
  });

  /* ===========================================================
     作成タブ（オリジナルQRコード生成）
     =========================================================== */
  const createSize = $("#createSize");
  createSize.addEventListener("input", () => { $("#createSizeVal").textContent = createSize.value; });

  let lastQrCanvas = null;

  $("#generateBtn").addEventListener("click", () => {
    const text = $("#createText").value.trim();
    if (!text) { toast("テキストまたはURLを入力してください"); return; }

    const ecLevel = $("#createEcLevel").value;
    const size = parseInt(createSize.value, 10);
    const fg = $("#createFg").value;
    const bg = $("#createBg").value;

    let qr;
    try {
      qr = qrcode(0, ecLevel);
      qr.addData(text);
      qr.make();
    } catch (err) {
      toast("QRコードを作成できませんでした（文字数が多すぎる可能性があります）");
      return;
    }

    const moduleCount = qr.getModuleCount();
    const cellSize = Math.max(2, Math.floor(size / moduleCount));
    const canvasSize = cellSize * moduleCount;

    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    ctx.fillStyle = fg;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    const wrap = $("#createCanvasWrap");
    wrap.innerHTML = "";
    wrap.appendChild(canvas);
    lastQrCanvas = canvas;
    $("#createResult").hidden = false;
    $("#shareQrBtn").hidden = !(navigator.canShare && navigator.share);
    toast("QRコードを作成しました");
  });

  $("#downloadQrBtn").addEventListener("click", () => {
    if (!lastQrCanvas) return;
    const a = document.createElement("a");
    a.href = lastQrCanvas.toDataURL("image/png");
    a.download = `qr-${Date.now()}.png`;
    a.click();
  });

  $("#shareQrBtn").addEventListener("click", async () => {
    if (!lastQrCanvas) return;
    try {
      const blob = await new Promise((resolve) => lastQrCanvas.toBlob(resolve, "image/png"));
      const file = new File([blob], "qrcode.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "QRコード" });
      } else {
        toast("この端末では共有できません");
      }
    } catch {
      /* ユーザーがキャンセルした場合は何もしない */
    }
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
    const action = e.target.closest("[data-action]")?.dataset.action;
    setMenuOpen(false);
    if (action === "clear") {
      if (!loadHistory().length) { toast("履歴はありません"); return; }
      if (!confirm("読み取り履歴をすべて削除しますか？")) return;
      saveHistory([]);
      renderHistory();
      toast("履歴を削除しました");
    }
  });

  /* ---------------- インストールバナー ---------------- */
  const installBanner = $("#installBanner");
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.hidden = false;
    $("#installMenuItem").hidden = false;
  });

  async function triggerInstall() {
    if (!deferredPrompt) { toast("お使いのブラウザのメニューから「ホーム画面に追加」を選んでください"); return; }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBanner.hidden = true;
    $("#installMenuItem").hidden = true;
  }
  $("#installBtn").addEventListener("click", triggerInstall);
  $("#installDismiss").addEventListener("click", () => { installBanner.hidden = true; });
  $("#installMenuItem").addEventListener("click", triggerInstall);

  window.addEventListener("appinstalled", () => {
    installBanner.hidden = true;
    $("#installMenuItem").hidden = true;
    toast("インストールしました🔳");
  });

  /* ---------------- Service Worker ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeunload", stopCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });

  /* ---------------- 初期化 ---------------- */
  renderHistory();
})();
