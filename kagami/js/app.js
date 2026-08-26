/* ===========================================================
   うつし鏡 — 画面まわりの処理
   写真の取り込み・顔範囲の調整・結果の描画・記録の管理。
   解析そのものは analyze.js（window.Kagami）が担当します。
   =========================================================== */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const HISTORY_KEY = "utsushi-kagami-history-v1";
  const HISTORY_LIMIT = 120;
  /** 解析に使う元画像の最大辺。大きすぎる写真は縮めてから扱う */
  const MAX_SOURCE = 1400;

  /* ---------------- トースト ---------------- */

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  /* ---------------- タブ ---------------- */

  const panels = {
    check: $("#panel-check"),
    history: $("#panel-history"),
    about: $("#panel-about"),
  };

  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.tab;
      $$(".tab-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== name; });
      if (name === "history") renderHistory();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  /* ---------------- 画面のステップ管理 ---------------- */

  const steps = {
    input: $("#step-input"),
    camera: $("#step-camera"),
    adjust: $("#step-adjust"),
    loading: $("#step-loading"),
    result: $("#step-result"),
  };

  function showStep(name) {
    Object.entries(steps).forEach(([key, el]) => { el.hidden = key !== name; });
    $("#global-error").hidden = true;
  }

  function showError(msg) {
    const el = $("#global-error");
    el.textContent = msg;
    el.hidden = false;
  }

  /* ---------------- 画像の取り込み ---------------- */

  /** 解析対象の元画像（縮小済みキャンバス） */
  let sourceCanvas = null;
  /** 顔の範囲（sourceCanvas の座標系） */
  let cropBox = null;
  /** 直近の解析結果 */
  let lastResult = null;

  /** File / Blob を読み込んでキャンバス化する */
  function loadImageFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showError("画像ファイルを選んでください。");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setSourceFrom(img, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showError("画像を読み込めませんでした。別の写真をお試しください。");
    };
    img.src = url;
  }

  /** 元画像を（必要なら縮小して）キャンバスに取り込み、顔検出へ進む */
  function setSourceFrom(source, w, h, mirror = false) {
    const scale = Math.min(1, MAX_SOURCE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    if (mirror) {
      // インカメラの映像は左右反転して表示されているため、見たままの向きで保存する
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, 0, 0, cw, ch);

    sourceCanvas = canvas;
    goAdjust();
  }

  $("#btn-file").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadImageFile(file);
    e.target.value = "";
  });

  const dropzone = $("#dropzone");
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-over");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-over");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  // ページ全体へのドロップでも受け付ける
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!steps.input.hidden) {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadImageFile(file);
    }
  });

  // クリップボードからの貼り付け
  document.addEventListener("paste", (e) => {
    if (steps.input.hidden) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        loadImageFile(item.getAsFile());
        break;
      }
    }
  });

  /* ---------------- カメラ ---------------- */

  let stream = null;
  let facingMode = "user";

  async function startCamera() {
    const video = $("#video");
    const errEl = $("#camera-error");
    errEl.hidden = true;
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showStep("input");
      showError("このブラウザではカメラを利用できません。「写真を選ぶ」からお試しください。");
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      video.srcObject = stream;
      // インカメラは鏡のように見えるほうが合わせやすい
      video.style.transform = facingMode === "user" ? "scaleX(-1)" : "none";
      await video.play();
      showStep("camera");
    } catch (err) {
      showStep("input");
      const msg =
        err && err.name === "NotAllowedError"
          ? "カメラの使用が許可されませんでした。ブラウザの設定で許可するか、「写真を選ぶ」をご利用ください。"
          : "カメラを起動できませんでした。「写真を選ぶ」からお試しください。";
      showError(msg);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    const video = $("#video");
    if (video) video.srcObject = null;
  }

  $("#btn-camera").addEventListener("click", startCamera);
  $("#btn-cancel-cam").addEventListener("click", () => {
    stopCamera();
    showStep("input");
  });
  $("#btn-switch-cam").addEventListener("click", () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    startCamera();
  });
  $("#btn-shutter").addEventListener("click", () => {
    const video = $("#video");
    if (!video.videoWidth) {
      toast("カメラの準備中です。少し待ってからお試しください。");
      return;
    }
    const mirror = facingMode === "user";
    setSourceFrom(video, video.videoWidth, video.videoHeight, mirror);
    stopCamera();
  });

  // 画面を離れるときはカメラを確実に止める
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });
  window.addEventListener("pagehide", stopCamera);

  /* ---------------- 顔の範囲を調整する ---------------- */

  const previewCanvas = $("#preview-canvas");
  const adjustStage = $("#adjust-stage");
  const cropEl = $("#crop-box");

  /** 顔検出を試み、調整画面を表示する */
  function goAdjust() {
    if (!sourceCanvas) return;
    showStep("adjust");

    const ctx = previewCanvas.getContext("2d");
    previewCanvas.width = sourceCanvas.width;
    previewCanvas.height = sourceCanvas.height;
    ctx.drawImage(sourceCanvas, 0, 0);

    const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const imageData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    let box = null;
    try {
      box = window.Kagami.detectFace(imageData);
    } catch (err) {
      box = null;
    }

    const lead = $("#adjust-lead");
    if (box && box.confidence >= 0.55) {
      lead.textContent = "顔を見つけました。ずれている場合は枠をドラッグして合わせてください。";
    } else if (box) {
      lead.textContent = "顔の位置がはっきりしません。枠を顔に合わせてから診断してください。";
    } else {
      lead.textContent = "顔を自動で見つけられませんでした。枠をドラッグして顔に合わせてください。";
      const w = sourceCanvas.width * 0.5;
      box = {
        x: (sourceCanvas.width - w) / 2,
        y: sourceCanvas.height * 0.5 - (w * 1.32) / 2,
        w,
        h: w * 1.32,
      };
    }

    cropBox = clampBox(box);
    layoutCropBox();
  }

  /** 枠が画像からはみ出さないよう整える */
  function clampBox(box) {
    const W = sourceCanvas.width, H = sourceCanvas.height;
    let w = clamp(box.w, Math.min(60, W), W);
    let h = w * 1.32;
    if (h > H) { h = H; w = h / 1.32; }
    const x = clamp(box.x, 0, W - w);
    const y = clamp(box.y, 0, H - h);
    return { x, y, w, h };
  }

  /** cropBox（画像座標）を画面上の枠の位置に反映する */
  function layoutCropBox() {
    if (!cropBox || !sourceCanvas) return;
    const rect = previewCanvas.getBoundingClientRect();
    if (!rect.width) return;
    const k = rect.width / sourceCanvas.width;
    cropEl.style.left = cropBox.x * k + "px";
    cropEl.style.top = cropBox.y * k + "px";
    cropEl.style.width = cropBox.w * k + "px";
    cropEl.style.height = cropBox.h * k + "px";
  }

  window.addEventListener("resize", layoutCropBox);

  /* 枠のドラッグ移動 */
  let dragState = null;

  cropEl.addEventListener("pointerdown", (e) => {
    if (e.target === $("#crop-handle")) return;
    cropEl.setPointerCapture(e.pointerId);
    dragState = { mode: "move", startX: e.clientX, startY: e.clientY, box: { ...cropBox } };
    e.preventDefault();
  });

  $("#crop-handle").addEventListener("pointerdown", (e) => {
    $("#crop-handle").setPointerCapture(e.pointerId);
    dragState = { mode: "resize", startX: e.clientX, startY: e.clientY, box: { ...cropBox } };
    e.preventDefault();
    e.stopPropagation();
  });

  function onPointerMove(e) {
    if (!dragState || !sourceCanvas) return;
    const rect = previewCanvas.getBoundingClientRect();
    const k = sourceCanvas.width / rect.width;
    const dx = (e.clientX - dragState.startX) * k;
    const dy = (e.clientY - dragState.startY) * k;
    const b = dragState.box;

    if (dragState.mode === "move") {
      cropBox = clampBox({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
    } else {
      // 縦横比を保ったまま、対角方向のドラッグ量で拡大縮小する
      const delta = (dx + dy / 1.32) / 2;
      cropBox = clampBox({ x: b.x, y: b.y, w: Math.max(60, b.w + delta), h: 0 });
    }
    layoutCropBox();
  }

  function onPointerUp() { dragState = null; }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);

  // キーボードでも大きさを変えられるようにする
  $("#crop-handle").addEventListener("keydown", (e) => {
    const step = sourceCanvas ? sourceCanvas.width * 0.03 : 10;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      cropBox = clampBox({ ...cropBox, w: cropBox.w + step });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      cropBox = clampBox({ ...cropBox, w: Math.max(60, cropBox.w - step) });
    } else {
      return;
    }
    e.preventDefault();
    layoutCropBox();
  });

  $("#btn-redo").addEventListener("click", () => {
    sourceCanvas = null;
    cropBox = null;
    showStep("input");
  });

  /* ---------------- 解析の実行 ---------------- */

  $("#btn-analyze").addEventListener("click", () => {
    if (!sourceCanvas || !cropBox) return;
    showStep("loading");
    // 画面の描画を挟んでから重い処理に入る
    setTimeout(runAnalysis, 60);
  });

  /** 直近の顔の特徴点（肌の解析と顔立ちの両方で使う） */
  let lastLandmarks = null;

  async function runAnalysis() {
    let result = null;
    lastLandmarks = null;

    try {
      // 顔の特徴点が取れるときは、部位を正確に当てられるそちらで解析する。
      // 取れないとき（モデルを読めない環境・横顔など）は、
      // 肌色と明暗だけで測る従来のしくみに切り替える。
      if (window.KagamiFaceType && window.KagamiMeasure) {
        lastLandmarks = await window.KagamiFaceType.landmarksOf(sourceCanvas);
        if (lastLandmarks) {
          result = window.KagamiMeasure.analyzeWithLandmarks(
            sourceCanvas, lastLandmarks.landmarks, lastLandmarks.expression
          );
        }
      }
      if (!result) result = window.Kagami.analyze(sourceCanvas, cropBox);

      // 年齢は学習済みモデルで推定する。画像の特徴から測る経験則より正確なため。
      // モデルを読み込めない環境では、経験則の推定をそのまま使う。
      const guess = window.KagamiAgeModel
        ? await window.KagamiAgeModel.estimate(sourceCanvas, lastLandmarks ? lastLandmarks.landmarks : null)
        : null;

      if (!result.ok && guess) {
        // 肌は測れなかったが年齢は出せる場合（顔が小さい写真など）。
        // 何も返さずに終えるより、出せるものを出したほうが役に立つ。
        result = { ok: true, ageOnly: true, skinSkipReason: result.reason, items: [], scores: {} };
      }

      if (result.ok && guess) {
        result.age = clamp(Math.round(guess.age), 15, 89);
        result.ageRange = guess.range;
        result.ageSource = guess.source;
      } else if (result.ok) {
        result.ageSource = "heuristic";
      }
    } catch (err) {
      showStep("adjust");
      showError("解析中に問題が起きました。別の写真でお試しください。");
      return;
    }

    if (!result.ok) {
      showStep("adjust");
      showError(result.reason);
      return;
    }

    lastResult = result;
    renderResult(result);
    showStep("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
    runFaceType();
  }

  /* ---------------- 顔立ちのタイプ ---------------- */

  /** 直近の顔立ち判定 */
  let lastFaceType = null;

  /**
   * 顔立ちのタイプを判定して表示する。
   * 肌の解析とは別のしくみ（顔の特徴点の検出）を使い、時間もかかるため、
   * 結果画面を出したあとに追いかけて表示する。
   * 判定できない環境・写真ではカードごと出さない。
   */
  async function runFaceType() {
    const card = $("#facetype-card");
    lastFaceType = null;
    if (!window.KagamiFaceType || !sourceCanvas) { card.hidden = true; return; }

    $("#facetype-loading").hidden = false;
    $("#facetype-body").hidden = true;
    card.hidden = false;

    const type = lastLandmarks
      ? window.KagamiFaceType.typeOf(lastLandmarks.landmarks, sourceCanvas.height / sourceCanvas.width)
      : await window.KagamiFaceType.detect(sourceCanvas);
    if (!type) { card.hidden = true; return; }

    lastFaceType = type;
    $("#facetype-name").textContent = type.name;
    $("#facetype-yomi").textContent = type.yomi;
    $("#facetype-match").textContent = type.match;
    $("#facetype-catch").textContent = type.near
      ? `${type.catch}（${type.near}寄り）`
      : type.catch;
    $("#facetype-impression").textContent = type.impression;
    $("#facetype-strong").textContent = type.strong;
    renderExamples(type.key);

    const list = $("#facetype-details");
    list.textContent = "";
    type.details.forEach((d) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "d-label";
      label.textContent = d.label;
      const value = document.createElement("span");
      value.className = "d-value";
      value.textContent = d.value;
      const note = document.createElement("span");
      note.className = "d-note";
      note.textContent = d.note;
      const ref = document.createElement("span");
      ref.className = "d-ref";
      ref.textContent = d.ref;
      li.append(label, value, note, ref);
      list.appendChild(li);
    });

    $("#facetype-loading").hidden = true;
    $("#facetype-body").hidden = false;
  }

  /* ---------------- 顔タイプの例（名前） ---------------- */

  /**
   * このタイプの例として登録された名前を出す。
   * 登録が無ければ、登録できることだけ案内する。
   */
  function renderExamples(key) {
    const box = $("#facetype-examples");
    const empty = $("#facetype-example-empty");
    const names = window.KagamiExamples ? window.KagamiExamples.namesFor(key) : [];

    if (names.length) {
      $("#facetype-example-names").textContent = names.join(" ／ ");
      box.hidden = false;
      empty.hidden = true;
    } else {
      box.hidden = true;
      empty.hidden = false;
    }
  }

  /** 「しくみ」タブの登録画面を組み立てる */
  function setupExampleEditor() {
    const wrap = $("#example-rows");
    if (!wrap || !window.KagamiExamples || !window.KagamiFaceType) return;

    const current = window.KagamiExamples.all();
    const inputs = {};

    window.KagamiFaceType.TYPES.forEach((t) => {
      const row = document.createElement("div");
      row.className = "example-row";

      const label = document.createElement("label");
      label.className = "ex-label";
      label.textContent = t.name;
      label.setAttribute("for", "ex-" + t.key);

      const input = document.createElement("input");
      input.type = "text";
      input.id = "ex-" + t.key;
      input.placeholder = "例: 名前A、名前B";
      input.value = (current[t.key] || []).join("、");
      inputs[t.key] = input;

      row.append(label, input);
      wrap.appendChild(row);
    });

    $("#btn-examples-save").addEventListener("click", () => {
      const map = {};
      Object.entries(inputs).forEach(([key, input]) => {
        map[key] = input.value
          .split(/[、,]/)
          .map((n) => n.trim())
          .filter(Boolean)
          .slice(0, 6);
      });
      if (window.KagamiExamples.save(map)) {
        toast("登録しました");
        if (lastFaceType) renderExamples(lastFaceType.key);
      } else {
        toast("登録できませんでした");
      }
    });

    $("#btn-examples-clear").addEventListener("click", () => {
      if (!confirm("登録した名前をすべて消します。よろしいですか？")) return;
      window.KagamiExamples.clear();
      Object.entries(inputs).forEach(([key, input]) => {
        input.value = (window.KagamiExamples.defaults[key] || []).join("、");
      });
      toast("登録を消しました");
      if (lastFaceType) renderExamples(lastFaceType.key);
    });
  }

  /* ---------------- 個人補正 ---------------- */

  /*
   * 推定年齢は「写真から見た目を測った値」なので、実年齢とは人によって
   * ずれ方の癖がある。実年齢を入れて記録した回が2回以上あれば、その差の
   * 中央値ぶんだけ結果をずらし、その人に合った表示にする。
   *
   * 中央値を使うのは、たまたま条件の悪かった1回に引きずられないため。
   * ずらす量は上限を設け、記録が少ないうちは効き目を弱めている。
   */
  const CALIBRATION_MIN = 2;

  function personalOffset() {
    const pairs = loadHistory()
      .filter((e) => Number.isFinite(e.realAge) && Number.isFinite(e.rawAge != null ? e.rawAge : e.age))
      .map((e) => e.realAge - (e.rawAge != null ? e.rawAge : e.age));
    if (pairs.length < CALIBRATION_MIN) return null;

    const sorted = pairs.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // 記録が少ないうちは控えめに寄せる（2回で6割、5回以上で全部）
    const strength = clamp(pairs.length / 5, 0.6, 1);
    const offset = Math.round(clamp(median * strength, -15, 15));
    return { offset, samples: pairs.length };
  }

  /* ---------------- 結果の描画 ---------------- */

  function renderResult(result) {
    // 実年齢を登録した記録があれば、その人のずれの分だけ補正する
    const calib = personalOffset();
    // 二度描画しても補正が重ねがけにならないよう、補正前の値を保っておく
    if (result.rawAge == null) result.rawAge = result.age;
    result.age = calib ? clamp(result.rawAge + calib.offset, 15, 79) : result.rawAge;

    $("#result-age").textContent = result.age;
    $("#result-score").textContent = result.score;

    const rangeEl = $("#result-range");
    if (result.ageRange) {
      rangeEl.textContent = `およそ ${Math.max(15, result.age - result.ageRange)}〜${Math.min(79, result.age + result.ageRange)} 歳`;
      rangeEl.hidden = false;
    } else {
      rangeEl.hidden = true;
    }

    const sourceEl = $("#result-source");
    if (sourceEl) {
      if (result.ageSource === "heuristic") {
        sourceEl.textContent = "簡易判定（年齢推定モデルを読み込めませんでした）";
        sourceEl.hidden = false;
      } else {
        sourceEl.hidden = true;
      }
    }

    const calibEl = $("#result-calibrated");
    if (calib && calib.offset !== 0) {
      const dir = calib.offset > 0 ? "上" : "下";
      calibEl.textContent = `あなたの記録${calib.samples}件から ${Math.abs(calib.offset)}歳 ${dir}に補正しています`;
      calibEl.hidden = false;
    } else if (calib) {
      calibEl.textContent = `あなたの記録${calib.samples}件で補正済みです`;
      calibEl.hidden = false;
    } else {
      calibEl.hidden = true;
    }

    // 肌スコアのリング（円周 2πr, r=52 → 約326.7）
    const circumference = 2 * Math.PI * 52;
    const ring = $("#ring-fg");
    ring.style.strokeDashoffset = String(circumference);
    // 一度リセットしてからアニメーションさせる
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(circumference * (1 - result.score / 100));
    });

    // 実年齢が入力済みなら差分を出す
    updateAgeDiff();

    // 肌を測れなかったときは、年齢だけを見せる
    const ageOnly = !!result.ageOnly;
    $("#score-ring-wrap").hidden = ageOnly;
    $("#items-card").hidden = ageOnly;
    $("#care-card").hidden = ageOnly;
    $("#result-comment").hidden = ageOnly;
    const skipEl = $("#result-skin-skip");
    if (ageOnly) {
      skipEl.textContent = "肌の解析はできませんでした。" + (result.skinSkipReason || "");
      skipEl.hidden = false;
      $("#result-notes").hidden = true;
      return;
    }
    skipEl.hidden = true;

    $("#result-comment").textContent = buildOverall(result);

    const notesEl = $("#result-notes");
    if (result.notes && result.notes.length) {
      notesEl.textContent = "撮影について: " + result.notes.join(" ");
      notesEl.hidden = false;
    } else {
      notesEl.hidden = true;
    }

    renderRadar(result.items);
    renderItems(result.items);
    renderCare(result.items);
  }

  /** 総合講評（analyze.js の各項目から組み立てる） */
  function buildOverall(result) {
    const worst = result.items.slice().sort((a, b) => b.value - a.value)[0];
    const best = result.items.slice().sort((a, b) => a.value - b.value)[0];
    const score = result.score;
    let head;
    if (score >= 82) head = "とても良い状態です。";
    else if (score >= 68) head = "全体としては良好です。";
    else if (score >= 52) head = "標準的な状態です。";
    else if (score >= 36) head = "少しお疲れぎみの肌です。";
    else head = "肌が休息を求めているようです。";
    return `${head}「${best.label}」は特に良い状態。いま最も気になるのは「${worst.label}」（${worst.hint}）です。`;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  }

  /** 7項目のレーダーチャートを描く */
  function renderRadar(items) {
    const svg = $("#radar");
    // タイトル以外を消す
    $$("#radar > *:not(title)", document).forEach((el) => el.remove());

    const cx = 130, cy = 132, R = 84;
    const n = items.length;
    const angle = (i) => (-Math.PI / 2) + (2 * Math.PI * i) / n;

    // 目盛りの多角形（4段）
    for (let ring = 1; ring <= 4; ring++) {
      const r = (R * ring) / 4;
      const pts = items
        .map((_, i) => `${(cx + r * Math.cos(angle(i))).toFixed(1)},${(cy + r * Math.sin(angle(i))).toFixed(1)}`)
        .join(" ");
      svg.appendChild(svgEl("polygon", { points: pts, class: "radar-grid" }));
    }

    // 軸
    items.forEach((_, i) => {
      svg.appendChild(svgEl("line", {
        x1: cx, y1: cy,
        x2: (cx + R * Math.cos(angle(i))).toFixed(1),
        y2: (cy + R * Math.sin(angle(i))).toFixed(1),
        class: "radar-axis",
      }));
    });

    // 値の多角形
    const pts = items.map((it, i) => {
      const r = R * clamp(it.rating / 100, 0.06, 1);
      return `${(cx + r * Math.cos(angle(i))).toFixed(1)},${(cy + r * Math.sin(angle(i))).toFixed(1)}`;
    });
    svg.appendChild(svgEl("polygon", { points: pts.join(" "), class: "radar-area" }));

    // 頂点の点とラベル
    items.forEach((it, i) => {
      const r = R * clamp(it.rating / 100, 0.06, 1);
      svg.appendChild(svgEl("circle", {
        cx: (cx + r * Math.cos(angle(i))).toFixed(1),
        cy: (cy + r * Math.sin(angle(i))).toFixed(1),
        r: 3, class: "radar-dot",
      }));

      const lr = R + 20;
      const lx = cx + lr * Math.cos(angle(i));
      const ly = cy + lr * Math.sin(angle(i));
      const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
      const label = svgEl("text", {
        x: lx.toFixed(1), y: (ly + 4).toFixed(1),
        "text-anchor": anchor, class: "radar-label",
      });
      label.textContent = it.label;
      svg.appendChild(label);
    });
  }

  /** 項目ごとのバーと講評 */
  function renderItems(items) {
    const list = $("#item-list");
    list.textContent = "";
    items.forEach((it) => {
      const li = document.createElement("li");
      li.className = `item-row level-${it.level}`;

      const head = document.createElement("div");
      head.className = "item-head";
      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = it.label;
      const hint = document.createElement("span");
      hint.className = "item-hint";
      hint.textContent = it.hint;
      const value = document.createElement("span");
      value.className = "item-value";
      value.textContent = it.rating;
      head.append(name, hint, value);

      const bar = document.createElement("div");
      bar.className = "item-bar";
      const fill = document.createElement("div");
      fill.className = "item-bar-fill";
      fill.style.width = "0%";
      bar.appendChild(fill);
      requestAnimationFrame(() => { fill.style.width = it.rating + "%"; });

      const comment = document.createElement("p");
      comment.className = "item-comment";
      comment.textContent = it.comment;

      li.append(head, bar, comment);
      list.appendChild(li);
    });
  }

  /** 気になる項目のケアを上位3件だけ出す */
  function renderCare(items) {
    const list = $("#care-list");
    list.textContent = "";
    const targets = items
      .slice()
      .sort((a, b) => b.value - a.value)
      .filter((it) => it.level !== "good")
      .slice(0, 3);

    if (!targets.length) {
      const li = document.createElement("li");
      li.textContent = "気になる項目はありません。今のケアをそのまま続けてください。";
      list.appendChild(li);
      return;
    }

    targets.forEach((it) => {
      const li = document.createElement("li");
      const b = document.createElement("b");
      b.textContent = it.label + " — ";
      li.append(b, document.createTextNode(it.care));
      list.appendChild(li);
    });
  }

  /* ---------------- 実年齢との差 ---------------- */

  function updateAgeDiff() {
    const el = $("#result-diff");
    const real = parseInt($("#real-age").value, 10);
    if (!lastResult || !Number.isFinite(real) || real < 5 || real > 110) {
      el.hidden = true;
      return;
    }
    const diff = lastResult.age - real;
    el.classList.toggle("is-young", diff < 0);
    el.classList.toggle("is-old", diff > 0);
    if (diff === 0) el.textContent = "実年齢とちょうど同じでした。";
    else if (diff < 0) el.textContent = `実年齢より ${Math.abs(diff)} 歳 若い結果です。`;
    else el.textContent = `実年齢より ${diff} 歳 上の結果です。`;
    el.hidden = false;
  }

  $("#real-age").addEventListener("input", updateAgeDiff);

  $("#btn-again").addEventListener("click", () => {
    sourceCanvas = null;
    cropBox = null;
    lastResult = null;
    lastFaceType = null;
    $("#facetype-card").hidden = true;
    $("#memo").value = "";
    showStep("input");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------------- 記録（localStorage） ---------------- */

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
      return true;
    } catch {
      toast("端末の保存領域がいっぱいのようです。古い記録を削除してください。");
      return false;
    }
  }

  /** 記録用の小さなサムネイル（顔の範囲を96pxに縮小したJPEG）を作る */
  function makeThumb() {
    if (!sourceCanvas || !cropBox) return "";
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    // 正方形に収まるよう、顔の中央を切り出す
    const side = Math.min(cropBox.w, cropBox.h);
    const sx = cropBox.x + (cropBox.w - side) / 2;
    const sy = cropBox.y + (cropBox.h - side) / 2;
    ctx.drawImage(sourceCanvas, sx, sy, side, side, 0, 0, size, size);
    try {
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return "";
    }
  }

  $("#btn-save").addEventListener("click", () => {
    if (!lastResult) return;
    const realAge = parseInt($("#real-age").value, 10);
    const entry = {
      id: Date.now(),
      at: new Date().toISOString(),
      age: lastResult.age,
      rawAge: lastResult.rawAge != null ? lastResult.rawAge : lastResult.age,
      score: lastResult.score != null ? lastResult.score : null,
      realAge: Number.isFinite(realAge) && realAge >= 5 && realAge <= 110 ? realAge : null,
      memo: $("#memo").value.trim().slice(0, 40),
      scores: lastResult.scores,
      faceType: lastFaceType ? lastFaceType.name : null,
      thumb: makeThumb(),
    };
    const list = loadHistory();
    list.unshift(entry);
    if (saveHistory(list)) toast("記録しました");
  });

  $("#btn-clear").addEventListener("click", () => {
    if (!confirm("すべての記録を削除します。よろしいですか？")) return;
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* 何もしない */ }
    renderHistory();
    toast("記録をすべて削除しました");
  });

  /**
   * 埋め込みビューアなど、ページから直接ファイルを保存できない環境向けの窓口。
   * 使えない場合は null を返し、通常のダウンロードにそのまま任せる。
   */
  async function viewerSave() {
    try {
      if (!window.claude || typeof window.claude.use !== "function") return null;
      const downloads = await window.claude.use("downloads");
      return downloads && typeof downloads.save === "function"
        ? (req) => downloads.save(req)
        : null;
    } catch {
      return null;
    }
  }

  $("#btn-export").addEventListener("click", async () => {
    const list = loadHistory();
    if (!list.length) { toast("書き出す記録がありません"); return; }
    // 画像は大きいので、書き出しには含めない
    const plain = list.map(({ thumb, ...rest }) => rest);
    const json = JSON.stringify(plain, null, 2);
    const filename = `utsushi-kagami-${new Date().toISOString().slice(0, 10)}.json`;

    const save = await viewerSave();
    if (save) {
      try {
        await save({ filename, data: json });
        toast("記録を書き出しました");
      } catch (err) {
        // 利用者が保存をやめた場合は何も知らせない
        if (!err || err.code !== "declined") toast("書き出せませんでした");
      }
      return;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let chartMetric = "age";

  $$(".chart-toggle .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chartMetric = chip.dataset.metric;
      $$(".chart-toggle .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      renderHistory();
    });
  });

  function renderHistory() {
    const list = loadHistory();
    const hasAny = list.length > 0;
    $("#history-empty").hidden = hasAny;
    $("#history-list-card").hidden = !hasAny;
    $("#history-chart-card").hidden = list.length < 2;

    if (!hasAny) return;

    // 一覧
    const ul = $("#history-list");
    ul.textContent = "";
    list.forEach((entry) => {
      const li = document.createElement("li");

      if (entry.thumb) {
        const img = document.createElement("img");
        img.className = "history-thumb";
        img.src = entry.thumb;
        img.alt = "";
        li.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "history-thumb";
        li.appendChild(ph);
      }

      const main = document.createElement("div");
      main.className = "history-main";

      const date = document.createElement("div");
      date.className = "history-date";
      date.textContent = formatDate(entry.at);

      const figures = document.createElement("div");
      figures.className = "history-figures";
      figures.append(
        document.createTextNode(`顔年齢 ${entry.age}歳`),
        Object.assign(document.createElement("span"), { className: "sep", textContent: "／" }),
        document.createTextNode(`スコア ${entry.score}`)
      );

      main.append(date, figures);

      if (entry.faceType) {
        const ft = document.createElement("div");
        ft.className = "history-memo";
        ft.textContent = entry.faceType;
        main.appendChild(ft);
      }

      if (entry.memo) {
        const memo = document.createElement("div");
        memo.className = "history-memo";
        memo.textContent = entry.memo;
        main.appendChild(memo);
      }

      const del = document.createElement("button");
      del.className = "history-del";
      del.type = "button";
      del.textContent = "✕";
      del.setAttribute("aria-label", "この記録を削除");
      del.addEventListener("click", () => {
        const next = loadHistory().filter((e) => e.id !== entry.id);
        saveHistory(next);
        renderHistory();
        toast("削除しました");
      });

      li.append(main, del);
      ul.appendChild(li);
    });

    if (list.length >= 2) renderChart(list);
  }

  /** 推移グラフ（古い順に左から） */
  function renderChart(list) {
    const svg = $("#history-chart");
    $$("#history-chart > *:not(title)", document).forEach((el) => el.remove());

    const data = list.slice().reverse().slice(-24);
    const values = data.map((e) => (chartMetric === "age" ? e.age : e.score));
    const W = 320, H = 180;
    const padL = 34, padR = 12, padT = 14, padB = 26;

    let lo = Math.min(...values), hi = Math.max(...values);
    if (hi - lo < 6) { const mid = (hi + lo) / 2; lo = mid - 3; hi = mid + 3; }
    const pad = (hi - lo) * 0.15;
    lo -= pad; hi += pad;

    const px = (i) => padL + ((W - padL - padR) * i) / Math.max(1, data.length - 1);
    const py = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));

    // 横罫線と目盛り
    for (let t = 0; t <= 3; t++) {
      const v = lo + ((hi - lo) * t) / 3;
      const y = py(v);
      svg.appendChild(svgEl("line", { x1: padL, y1: y.toFixed(1), x2: W - padR, y2: y.toFixed(1), class: "chart-grid" }));
      const label = svgEl("text", { x: padL - 6, y: (y + 3.5).toFixed(1), "text-anchor": "end", class: "chart-text" });
      label.textContent = String(Math.round(v));
      svg.appendChild(label);
    }

    const points = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);

    // 塗り
    svg.appendChild(svgEl("polygon", {
      points: `${padL},${(H - padB).toFixed(1)} ${points.join(" ")} ${(W - padR).toFixed(1)},${(H - padB).toFixed(1)}`,
      class: "chart-area",
    }));
    // 線
    svg.appendChild(svgEl("polyline", { points: points.join(" "), class: "chart-line" }));
    // 点
    values.forEach((v, i) => {
      svg.appendChild(svgEl("circle", { cx: px(i).toFixed(1), cy: py(v).toFixed(1), r: 3.2, class: "chart-dot" }));
    });

    // 両端の日付
    const first = svgEl("text", { x: padL, y: H - 8, "text-anchor": "start", class: "chart-text" });
    first.textContent = formatDate(data[0].at).slice(5, 10);
    const last = svgEl("text", { x: W - padR, y: H - 8, "text-anchor": "end", class: "chart-text" });
    last.textContent = formatDate(data[data.length - 1].at).slice(5, 10);
    svg.append(first, last);

    // まとめの一文
    const diff = values[values.length - 1] - values[0];
    const unit = chartMetric === "age" ? "歳" : "点";
    const name = chartMetric === "age" ? "顔年齢" : "肌スコア";
    let text;
    if (Math.abs(diff) < 0.5) {
      text = `最初の記録から${name}はほぼ変わっていません（${data.length}件）。`;
    } else {
      const dir = diff < 0 ? "下がりました" : "上がりました";
      text = `最初の記録から${name}は ${Math.abs(Math.round(diff))}${unit} ${dir}（${data.length}件）。`;
    }
    $("#chart-summary").textContent = text;
  }

  /* ---------------- ホーム画面への追加 ---------------- */

  const INSTALL_DISMISS_KEY = "utsushi-kagami-install-dismissed-v1";

  /** すでにアプリとして起動しているか */
  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  /**
   * 手順を自分でたどってもらう案内を出す。
   * Chrome 以外（iOS の Safari など）にはインストールを起動する仕組みがないため、
   * その端末で実際に必要な操作だけを並べる。
   */
  function showInstallSteps(title, lead, steps) {
    const card = $("#install-card");
    if (!card) return;
    $("#install-card .card-title").textContent = title;
    $("#install-lead").textContent = lead;
    $("#install-actions").hidden = true;

    const list = $("#install-steps");
    list.textContent = "";
    steps.forEach((step) => {
      const li = document.createElement("li");
      li.innerHTML = "";
      // 太字にしたい部分は【】で囲って渡す
      step.split(/【|】/).forEach((part, i) => {
        if (i % 2 === 1) {
          const b = document.createElement("b");
          b.textContent = part;
          li.appendChild(b);
        } else if (part) {
          li.appendChild(document.createTextNode(part));
        }
      });
      list.appendChild(li);
    });
    list.hidden = false;
    card.hidden = false;
  }

  function setupInstall() {
    const card = $("#install-card");
    // マニフェストの無いページ（単体で埋め込んだ場合など）では案内しない
    if (!card || !document.querySelector('link[rel="manifest"]')) return;

    const aboutSection = $("#about-install");
    if (isInstalled()) {
      // インストール済みなら、案内はどこにも出さない
      if (aboutSection) aboutSection.hidden = true;
      return;
    }

    let dismissed = false;
    try { dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1"; } catch { /* 既定のまま */ }

    let deferredPrompt = null;

    // Chrome 系: ブラウザがインストール可能と判断した時点で呼ばれる
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!dismissed) card.hidden = false;
    });

    $("#btn-install").addEventListener("click", async () => {
      if (!deferredPrompt) return;
      const prompt = deferredPrompt;
      deferredPrompt = null;
      card.hidden = true;
      try {
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome !== "accepted") {
          // 断られた場合は、次の機会にまた出せるよう元に戻す
          deferredPrompt = prompt;
          card.hidden = dismissed;
        }
      } catch {
        toast("インストールを開始できませんでした");
      }
    });

    $("#btn-install-later").addEventListener("click", () => {
      dismissed = true;
      card.hidden = true;
      try { localStorage.setItem(INSTALL_DISMISS_KEY, "1"); } catch { /* 保存できなくても支障はない */ }
    });

    window.addEventListener("appinstalled", () => {
      card.hidden = true;
      if (aboutSection) aboutSection.hidden = true;
      toast("ホーム画面に追加しました");
    });

    if (dismissed) return;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // LINE・X・Facebook などのアプリ内ブラウザ。インストールの項目自体が無い
    const isInAppBrowser = /\bFBAN|\bFBAV|Line\/|Instagram|Twitter|MicroMessenger/i.test(ua);

    if (isInAppBrowser) {
      showInstallSteps(
        "ブラウザで開くとインストールできます",
        "いまアプリの中のブラウザで開いているため、ホーム画面に追加できません。",
        [
          "画面の【…】または【⋮】メニューを開く",
          "【ブラウザで開く】（Chrome・Safari）を選ぶ",
          "開いたブラウザで、あらためてこの案内に従う",
        ]
      );
      return;
    }

    if (isIOS) {
      showInstallSteps(
        "ホーム画面に追加",
        "アプリのように起動でき、オフラインでも使えます。Safari で次の操作をしてください。",
        [
          "画面下の【共有ボタン】（□に↑）を押す",
          "メニューを下にたどって【ホーム画面に追加】を選ぶ",
          "右上の【追加】を押す",
        ]
      );
      return;
    }

    // Chrome 以外のPC・Androidブラウザ向け。beforeinstallprompt が来れば
    // 上のボタン付き表示に切り替わるので、少し待ってから案内を出す
    setTimeout(() => {
      if (deferredPrompt || !card.hidden || dismissed || isInstalled()) return;
      showInstallSteps(
        "ホーム画面に追加",
        "アプリのように起動でき、オフラインでも使えます。ご利用のブラウザのメニューから追加できます。",
        [
          "Android（Chrome）: 右上の【⋮】→【アプリをインストール】",
          "パソコン（Chrome・Edge）: アドレスバー右端の【インストール】",
        ]
      );
    }, 3000);
  }

  setupInstall();

  /* ---------------- Service Worker ---------------- */

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => { /* オフライン対応なしでも動く */ });
    });
  }

  // 「しくみ」タブへの案内リンク
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-goto-about]");
    if (!link) return;
    e.preventDefault();
    $("#tab-about").click();
    const target = $("#about-examples");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------------- 起動 ---------------- */

  showStep("input");
  renderHistory();
  setupExampleEditor();
})();
