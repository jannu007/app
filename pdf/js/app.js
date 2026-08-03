/* ===========================================================
   栞PDF — アプリロジック
   PDFはすべて端末内（このブラウザ）だけで処理されます。
   結合・分割・並べ替え・回転・透かし追加を pdf-lib / pdf.js / JSZip で実現。
   =========================================================== */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

  /* ---------------- 状態 ---------------- */
  const state = {
    docs: [],       // { name, pdfDoc(PDFLib), pdfjsDoc, pjsPages: Map }
    pages: [],      // { id, docIndex, pageIndex, rotation, sourceName, stamped, _canvas }
    selected: new Set(),
    nextId: 1,
  };

  /* ---------------- トースト ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------------- ローディング ---------------- */
  function showLoading(text) {
    $("#loadingText").textContent = text || "処理しています…";
    $("#loadingOverlay").hidden = false;
  }
  function hideLoading() {
    $("#loadingOverlay").hidden = true;
  }

  /* ---------------- 表示切り替え ---------------- */
  function updateView() {
    const has = state.pages.length > 0;
    $("#dropZone").hidden = has;
    $("#toolbar").hidden = !has;
    $("#pageGridWrap").hidden = !has;
  }

  function updateSelectionUI() {
    const n = state.selected.size;
    $("#selectionCount").textContent = n ? `${n}件選択中` : "";
    $("#rotateLeftBtn").disabled = n === 0;
    $("#rotateRightBtn").disabled = n === 0;
    $("#deleteSelBtn").disabled = n === 0;
    $("#exportSelBtn").disabled = n === 0;
    $("#selectAllBtn").textContent = (n > 0 && n === state.pages.length) ? "選択解除" : "全選択";
  }

  /* ---------------- ファイル読み込み ---------------- */
  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)
    );
    if (!files.length) {
      toast("PDFファイルを選んでください");
      return;
    }
    showLoading(`読み込み中…`);
    let addedCount = 0;
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(buf.slice(0));
        const pdfjsDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        const docIndex = state.docs.push({ name: file.name, pdfDoc, pdfjsDoc, pjsPages: new Map() }) - 1;
        const count = pdfDoc.getPageCount();
        for (let i = 0; i < count; i++) {
          state.pages.push({
            id: "p" + (state.nextId++),
            docIndex,
            pageIndex: i,
            rotation: 0,
            sourceName: file.name,
            stamped: false,
            _canvas: null,
          });
        }
        addedCount += count;
      } catch (err) {
        console.warn("PDF読み込み失敗", file.name, err);
        toast(`「${file.name}」を読み込めませんでした（暗号化PDFなどは非対応です）`);
      }
    }
    hideLoading();
    if (addedCount > 0) toast(`${addedCount}ページ追加しました`);
    updateView();
    renderGrid();
    renderThumbsProgressively();
  }

  /* ---------------- サムネイル描画 ---------------- */
  async function getPjsPage(doc, pageIndex) {
    if (doc.pjsPages.has(pageIndex)) return doc.pjsPages.get(pageIndex);
    const page = await doc.pdfjsDoc.getPage(pageIndex + 1);
    doc.pjsPages.set(pageIndex, page);
    return page;
  }

  async function renderThumbCanvas(entry) {
    const doc = state.docs[entry.docIndex];
    const page = await getPjsPage(doc, entry.pageIndex);
    const baseRotation = page.rotate || 0;
    const totalRotation = (baseRotation + entry.rotation + 360) % 360;
    const unscaled = page.getViewport({ scale: 1, rotation: totalRotation });
    const targetWidth = 200;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (targetWidth / unscaled.width) * dpr;
    const viewport = page.getViewport({ scale, rotation: totalRotation });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = Math.ceil(viewport.width / dpr) + "px";
    canvas.style.height = Math.ceil(viewport.height / dpr) + "px";
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  async function renderThumbsProgressively() {
    const pending = state.pages.filter((p) => !p._canvas);
    for (const entry of pending) {
      try {
        const canvas = await renderThumbCanvas(entry);
        entry._canvas = canvas;
        const wrap = document.querySelector(`.page-card[data-id="${entry.id}"] .page-thumb-wrap`);
        if (wrap) {
          wrap.querySelectorAll(".mini-spinner").forEach((s) => s.remove());
          wrap.prepend(canvas);
        }
      } catch (err) {
        console.warn("サムネイル生成失敗", err);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  /* ---------------- グリッド描画 ---------------- */
  function renderGrid() {
    const grid = $("#pageGrid");
    grid.innerHTML = "";
    const frag = document.createDocumentFragment();
    state.pages.forEach((entry, idx) => {
      const li = document.createElement("li");
      li.className = "page-card" + (state.selected.has(entry.id) ? " selected" : "") + (entry.stamped ? " has-stamp" : "");
      li.draggable = true;
      li.dataset.id = entry.id;

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "page-thumb-wrap";
      if (entry._canvas) {
        thumbWrap.appendChild(entry._canvas);
      } else {
        const sp = document.createElement("div");
        sp.className = "mini-spinner";
        thumbWrap.appendChild(sp);
      }
      const check = document.createElement("span");
      check.className = "page-check";
      check.textContent = state.selected.has(entry.id) ? "✓" : "";
      thumbWrap.appendChild(check);
      const badge = document.createElement("span");
      badge.className = "page-source-badge";
      badge.textContent = `${entry.sourceName} p.${entry.pageIndex + 1}`;
      thumbWrap.appendChild(badge);
      li.appendChild(thumbWrap);

      const indexEl = document.createElement("div");
      indexEl.className = "page-index";
      indexEl.textContent = `#${idx + 1}`;
      li.appendChild(indexEl);

      const actions = document.createElement("div");
      actions.className = "page-mini-actions";
      actions.innerHTML = `
        <button type="button" class="page-mini-btn" data-act="left" aria-label="前へ移動">◀</button>
        <button type="button" class="page-mini-btn" data-act="rotate" aria-label="回転">⟳</button>
        <button type="button" class="page-mini-btn" data-act="right" aria-label="後ろへ移動">▶</button>
        <button type="button" class="page-mini-btn danger" data-act="delete" aria-label="削除">🗑</button>
      `;
      li.appendChild(actions);

      frag.appendChild(li);
    });
    grid.appendChild(frag);
  }

  function afterMutate() {
    renderGrid();
    updateSelectionUI();
    updateView();
  }

  /* ---------------- 選択 / 並べ替え / 回転 / 削除 ---------------- */
  function selectedEntries() {
    return state.pages.filter((p) => state.selected.has(p.id));
  }

  function toggleSelect(id) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    const li = document.querySelector(`.page-card[data-id="${id}"]`);
    if (li) {
      li.classList.toggle("selected", state.selected.has(id));
      const chk = li.querySelector(".page-check");
      if (chk) chk.textContent = state.selected.has(id) ? "✓" : "";
    }
    updateSelectionUI();
  }

  function rotateEntries(entries, delta) {
    entries.forEach((e) => {
      e.rotation = (e.rotation + delta + 360) % 360;
      e._canvas = null;
    });
    renderGrid();
    renderThumbsProgressively();
  }

  function movePage(id, dir) {
    const idx = state.pages.findIndex((p) => p.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= state.pages.length) return;
    const tmp = state.pages[idx];
    state.pages[idx] = state.pages[j];
    state.pages[j] = tmp;
    renderGrid();
  }

  function movePageBefore(srcId, targetId) {
    const srcIdx = state.pages.findIndex((p) => p.id === srcId);
    if (srcIdx < 0) return;
    const [item] = state.pages.splice(srcIdx, 1);
    let targetIdx = state.pages.findIndex((p) => p.id === targetId);
    if (targetIdx < 0) targetIdx = state.pages.length;
    state.pages.splice(targetIdx, 0, item);
    renderGrid();
  }

  const grid = $("#pageGrid");

  grid.addEventListener("click", (e) => {
    const li = e.target.closest(".page-card");
    if (!li) return;
    const id = li.dataset.id;
    const miniBtn = e.target.closest(".page-mini-btn");
    if (miniBtn) {
      e.stopPropagation();
      const entry = state.pages.find((p) => p.id === id);
      if (!entry) return;
      const act = miniBtn.dataset.act;
      if (act === "rotate") rotateEntries([entry], 90);
      else if (act === "delete") {
        state.pages = state.pages.filter((p) => p.id !== id);
        state.selected.delete(id);
        afterMutate();
      } else if (act === "left") movePage(id, -1);
      else if (act === "right") movePage(id, 1);
      return;
    }
    toggleSelect(id);
  });

  let dragSrcId = null;
  grid.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".page-card");
    if (!li) return;
    dragSrcId = li.dataset.id;
    li.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragSrcId);
    }
  });
  grid.addEventListener("dragend", (e) => {
    const li = e.target.closest(".page-card");
    if (li) li.classList.remove("dragging");
    $$(".page-card.drop-target", grid).forEach((el) => el.classList.remove("drop-target"));
    dragSrcId = null;
  });
  grid.addEventListener("dragover", (e) => {
    const li = e.target.closest(".page-card");
    if (!li || !dragSrcId || li.dataset.id === dragSrcId) return;
    e.preventDefault();
    $$(".page-card.drop-target", grid).forEach((el) => {
      if (el !== li) el.classList.remove("drop-target");
    });
    li.classList.add("drop-target");
  });
  grid.addEventListener("drop", (e) => {
    const li = e.target.closest(".page-card");
    if (li) li.classList.remove("drop-target");
    if (!li || !dragSrcId || li.dataset.id === dragSrcId) return;
    e.preventDefault();
    movePageBefore(dragSrcId, li.dataset.id);
  });

  $("#selectAllBtn").addEventListener("click", () => {
    if (state.pages.length > 0 && state.selected.size === state.pages.length) {
      state.selected.clear();
    } else {
      state.pages.forEach((p) => state.selected.add(p.id));
    }
    renderGrid();
    updateSelectionUI();
  });

  $("#rotateLeftBtn").addEventListener("click", () => rotateEntries(selectedEntries(), -90));
  $("#rotateRightBtn").addEventListener("click", () => rotateEntries(selectedEntries(), 90));

  $("#deleteSelBtn").addEventListener("click", () => {
    if (!state.selected.size) return;
    state.pages = state.pages.filter((p) => !state.selected.has(p.id));
    state.selected.clear();
    afterMutate();
  });

  /* ---------------- ファイル入力 / ドラッグ&ドロップ ---------------- */
  const fileInput = $("#fileInput");
  $("#pickFileBtn").addEventListener("click", () => fileInput.click());
  $("#addMoreBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length) handleFiles(e.target.files);
    fileInput.value = "";
  });

  const dropZone = $("#dropZone");
  ["dragenter", "dragover"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });
  dropZone.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  });

  document.addEventListener("dragover", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
    }
  });
  document.addEventListener("drop", (e) => {
    if (e.target.closest("#dropZone")) return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    }
  });

  /* ---------------- PDF書き出し ---------------- */
  async function buildPdf(entries) {
    const outDoc = await PDFLib.PDFDocument.create();
    const grouped = new Map();
    entries.forEach((e) => {
      if (!grouped.has(e.docIndex)) grouped.set(e.docIndex, []);
      grouped.get(e.docIndex).push(e.pageIndex);
    });
    const copiedMap = new Map();
    for (const [docIndex, idxArr] of grouped) {
      const srcDoc = state.docs[docIndex].pdfDoc;
      const copiedPages = await outDoc.copyPages(srcDoc, idxArr);
      idxArr.forEach((pageIndex, i) => copiedMap.set(docIndex + ":" + pageIndex, copiedPages[i]));
    }
    for (const e of entries) {
      const copied = copiedMap.get(e.docIndex + ":" + e.pageIndex);
      const current = copied.getRotation().angle;
      copied.setRotation(PDFLib.degrees((current + e.rotation + 360) % 360));
      outDoc.addPage(copied);
    }
    return outDoc;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function timestampName(prefix, ext = "pdf") {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${prefix}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
  }

  $("#exportAllBtn").addEventListener("click", async () => {
    if (!state.pages.length) return;
    showLoading("PDFを書き出しています…");
    try {
      const outDoc = await buildPdf(state.pages);
      const bytes = await outDoc.save();
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), timestampName("merged"));
      toast("PDFを保存しました");
    } catch (err) {
      console.error(err);
      toast("書き出しに失敗しました");
    } finally {
      hideLoading();
    }
  });

  $("#exportSelBtn").addEventListener("click", async () => {
    const entries = state.pages.filter((p) => state.selected.has(p.id));
    if (!entries.length) return;
    showLoading("選択したページを書き出しています…");
    try {
      const outDoc = await buildPdf(entries);
      const bytes = await outDoc.save();
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), timestampName("selected"));
      toast("選択したページを保存しました");
    } catch (err) {
      console.error(err);
      toast("書き出しに失敗しました");
    } finally {
      hideLoading();
    }
  });

  $("#splitZipBtn").addEventListener("click", async () => {
    if (!state.pages.length) return;
    showLoading("ページを分割しています…");
    try {
      const zip = new JSZip();
      const total = state.pages.length;
      const padLen = Math.max(2, String(total).length);
      for (let i = 0; i < state.pages.length; i++) {
        const outDoc = await buildPdf([state.pages[i]]);
        const bytes = await outDoc.save();
        const num = String(i + 1).padStart(padLen, "0");
        zip.file(`page-${num}.pdf`, bytes);
        showLoading(`ページを分割しています…（${i + 1}/${total}）`);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, timestampName("split", "zip"));
      toast("ZIPで保存しました");
    } catch (err) {
      console.error(err);
      toast("分割に失敗しました");
    } finally {
      hideLoading();
    }
  });

  /* ---------------- 透かし・ページ番号 ---------------- */
  function makeTextImage({ text, fontSize, color, diagonal }) {
    const fontStr = `700 ${fontSize}px "Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",Meiryo,sans-serif`;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = fontStr;
    const metrics = probe.measureText(text);
    const textWidth = Math.max(metrics.width, 4);
    const textHeight = fontSize * 1.35;
    let canvasW, canvasH;
    if (diagonal) {
      const a = Math.PI / 4;
      canvasW = Math.ceil(Math.abs(textWidth * Math.cos(a)) + Math.abs(textHeight * Math.sin(a))) + 24;
      canvasH = canvasW;
    } else {
      canvasW = Math.ceil(textWidth) + 24;
      canvasH = Math.ceil(textHeight) + 16;
    }
    const dpr = 2;
    const canvas = document.createElement("canvas");
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.translate(canvasW / 2, canvasH / 2);
    if (diagonal) ctx.rotate(-Math.PI / 4);
    ctx.font = fontStr;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 0);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvasW, height: canvasH };
  }

  function computeStampXY(position, pageW, pageH, imgW, imgH) {
    const margin = Math.max(16, Math.min(pageW, pageH) * 0.035);
    switch (position) {
      case "center": return { x: pageW / 2 - imgW / 2, y: pageH / 2 - imgH / 2 };
      case "top-left": return { x: margin, y: pageH - margin - imgH };
      case "top-center": return { x: pageW / 2 - imgW / 2, y: pageH - margin - imgH };
      case "top-right": return { x: pageW - margin - imgW, y: pageH - margin - imgH };
      case "bottom-left": return { x: margin, y: margin };
      case "bottom-center": return { x: pageW / 2 - imgW / 2, y: margin };
      case "bottom-right": return { x: pageW - margin - imgW, y: margin };
      default: return { x: pageW / 2 - imgW / 2, y: pageH / 2 - imgH / 2 };
    }
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function applyStamps(targets, opts) {
    const embedCache = new Map();
    for (const entry of targets) {
      const doc = state.docs[entry.docIndex];
      const pdfDoc = doc.pdfDoc;
      const page = pdfDoc.getPages()[entry.pageIndex];
      let text = opts.text;
      if (opts.mode === "pageNumber") {
        const n = state.pages.indexOf(entry) + 1;
        const total = state.pages.length;
        text = text.replaceAll("{n}", String(n)).replaceAll("{total}", String(total));
      }
      const diagonal = opts.mode === "watermark" && opts.position === "center";
      const cacheKey = entry.docIndex + "|" + text + "|" + opts.fontSize + "|" + opts.color + "|" + diagonal;
      let img = embedCache.get(cacheKey);
      if (!img) {
        const { dataUrl, width, height } = makeTextImage({
          text, fontSize: opts.fontSize, color: opts.color, diagonal,
        });
        const bytes = dataUrlToBytes(dataUrl);
        const embedded = await pdfDoc.embedPng(bytes);
        img = { embedded, width, height };
        embedCache.set(cacheKey, img);
      }
      const w = page.getWidth();
      const h = page.getHeight();
      const { x, y } = computeStampXY(opts.position, w, h, img.width, img.height);
      page.drawImage(img.embedded, { x, y, width: img.width, height: img.height, opacity: opts.opacity });
    }
  }

  const stampModal = $("#stampModal");
  let stampMode = "watermark";

  function openStampModal() { stampModal.hidden = false; }
  function closeStampModal() { stampModal.hidden = true; }

  $("#watermarkBtn").addEventListener("click", openStampModal);
  $("#stampCancelBtn").addEventListener("click", closeStampModal);
  stampModal.addEventListener("click", (e) => { if (e.target === stampModal) closeStampModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !stampModal.hidden) closeStampModal();
  });

  function updateStampModeUI() {
    const textInput = $("#stampText");
    if (stampMode === "pageNumber") {
      $("#stampTextLabel").textContent = "ページ番号の書式";
      $("#stampTextNote").textContent = "{n}=ページ番号 / {total}=総ページ数 が使えます（日本語もOK）";
      if (!textInput.value || textInput.value === "サンプル") textInput.value = "{n} / {total}";
    } else {
      $("#stampTextLabel").textContent = "テキスト";
      $("#stampTextNote").textContent = "日本語・英数字・記号が使えます";
      if (textInput.value === "{n} / {total}") textInput.value = "サンプル";
    }
  }

  $$("#stampModeSeg .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#stampModeSeg .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stampMode = btn.dataset.mode;
      updateStampModeUI();
    });
  });

  $("#stampSize").addEventListener("input", (e) => { $("#stampSizeVal").textContent = e.target.value; });
  $("#stampOpacity").addEventListener("input", (e) => { $("#stampOpacityVal").textContent = e.target.value; });

  $("#stampApplyBtn").addEventListener("click", async () => {
    const text = $("#stampText").value.trim();
    if (!text) { toast("テキストを入力してください"); return; }
    const position = $("#stampPosition").value;
    const fontSize = Number($("#stampSize").value);
    const opacity = Number($("#stampOpacity").value) / 100;
    const color = $("#stampColor").value;
    const selectedOnly = $("#stampSelectedOnly").checked;

    let targets;
    if (selectedOnly) {
      targets = state.pages.filter((p) => state.selected.has(p.id));
      if (!targets.length) { toast("ページを選択してください"); return; }
    } else {
      targets = state.pages.slice();
    }
    closeStampModal();
    showLoading("追加しています…");
    try {
      await applyStamps(targets, { mode: stampMode, text, position, fontSize, opacity, color });
      targets.forEach((t) => { t.stamped = true; });
      renderGrid();
      toast(stampMode === "pageNumber" ? "ページ番号を追加しました" : "透かしを追加しました");
    } catch (err) {
      console.error(err);
      toast("追加に失敗しました");
    } finally {
      hideLoading();
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
    const btn = e.target.closest(".menu-item");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "clear") clearAll();
    if (action === "install") triggerInstall();
    setMenuOpen(false);
  });

  function clearAll() {
    if (!state.pages.length) { toast("読み込まれたPDFはありません"); return; }
    if (!confirm("読み込んだPDFをすべて削除して最初からやり直しますか？")) return;
    state.docs = [];
    state.pages = [];
    state.selected.clear();
    afterMutate();
    toast("クリアしました");
  }

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
    toast("インストールしました🔖");
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
  updateView();
  updateSelectionUI();
  updateStampModeUI();
})();
