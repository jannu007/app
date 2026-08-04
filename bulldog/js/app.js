/* ===========================================================
   ブル手帖 — アプリロジック
   すべてのデータは端末内 (localStorage) に保存されます。
   =========================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "buru-techo:v1";
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

  /* ---------------- データストア ---------------- */
  const defaultData = () => ({
    profile: { name: "", breed: "english", birthday: null, idealMin: null, idealMax: null },
    weights: [],
    walks: [],
    records: [],
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
      if (!this.data.profile) this.data.profile = defaultData().profile;
      if (!this.data.weights) this.data.weights = [];
      if (!this.data.walks) this.data.walks = [];
      if (!this.data.records) this.data.records = [];
    },

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    },

    addWeight(entry) { this.data.weights.push(entry); this.save(); },
    removeWeight(id) { this.data.weights = this.data.weights.filter((w) => w.id !== id); this.save(); },

    addWalk(entry) { this.data.walks.push(entry); this.save(); },
    removeWalk(id) { this.data.walks = this.data.walks.filter((w) => w.id !== id); this.save(); },

    addRecord(entry) { this.data.records.push(entry); this.save(); },
    removeRecord(id) { this.data.records = this.data.records.filter((r) => r.id !== id); this.save(); },

    saveProfile(profile) { this.data.profile = profile; this.save(); },
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

  /* ---------------- 熱中症リスク判定 ---------------- */
  const RISK_INFO = [
    { label: "安全", advice: "お散歩に適した気候です。それでも水分補給は忘れずに。" },
    { label: "注意", advice: "やや暑さに気をつけて。朝夕の涼しい時間を選び、休憩をこまめに取りましょう。" },
    { label: "危険", advice: "ブルドッグには危険な暑さです。お散歩は短時間にとどめるか、涼しい時間帯に変更しましょう。" },
    { label: "非常に危険", advice: "外出は避けてください。短頭種は熱中症の危険が非常に高い状況です。" },
  ];

  function heatRiskLevel(tempC, humidity) {
    if (tempC === null || tempC === undefined || Number.isNaN(tempC)) return null;
    let level;
    if (tempC >= 31) level = 3;
    else if (tempC >= 27) level = 2;
    else if (tempC >= 23) level = 1;
    else level = 0;
    if (humidity !== null && humidity !== undefined && !Number.isNaN(humidity)) {
      if (humidity >= 75 && level < 3) level++;
      else if (humidity >= 60 && level === 0) level = 1;
    }
    return level;
  }

  function riskBadgeHTML(level) {
    const info = RISK_INFO[level];
    return `<strong>${["🟢", "🟡", "🟠", "🔴"][level]} ${info.label}</strong>${info.advice}`;
  }

  function renderRiskBadge(el, tempInput, humidityInput) {
    const temp = tempInput === "" || tempInput === undefined ? NaN : Number(tempInput);
    const humidity = humidityInput === "" || humidityInput === undefined ? NaN : Number(humidityInput);
    if (Number.isNaN(temp)) { el.hidden = true; return null; }
    const level = heatRiskLevel(temp, Number.isNaN(humidity) ? null : humidity);
    el.hidden = false;
    el.className = `risk-badge risk-${level}`;
    el.innerHTML = riskBadgeHTML(level);
    return level;
  }

  /* ---------------- プロフィール表示 ---------------- */
  const BREED_LABEL = {
    english: "イングリッシュ・ブルドッグ",
    french: "フレンチ・ブルドッグ",
    american: "アメリカン・ブルドッグ",
    other: "ブルドッグ系",
  };

  function calcAge(birthdayKey) {
    if (!birthdayKey) return null;
    const b = fromKey(birthdayKey);
    const now = new Date();
    let years = now.getFullYear() - b.getFullYear();
    let months = now.getMonth() - b.getMonth();
    if (now.getDate() < b.getDate()) months--;
    if (months < 0) { years--; months += 12; }
    if (years < 0) return null;
    return years === 0 ? `生後${months}ヶ月` : `${years}歳${months}ヶ月`;
  }

  function renderProfile() {
    const p = Store.data.profile;
    const nameEl = $("#dogNameDisplay");
    const subEl = $("#dogSubDisplay");
    if (p.name) {
      nameEl.textContent = p.name;
      const age = calcAge(p.birthday);
      subEl.textContent = `${BREED_LABEL[p.breed] || BREED_LABEL.other}${age ? " ・ " + age : ""}`;
    } else {
      nameEl.textContent = "わんこの名前";
      subEl.textContent = "プロフィールを設定してください";
    }
  }

  /* ---------------- ホーム ---------------- */
  function recordTypeMeta(type) {
    return RECORD_TYPES[type] || RECORD_TYPES.other;
  }

  function dueText(dateKey) {
    const diff = Math.round((fromKey(dateKey) - fromKey(todayKey())) / 86400000);
    if (diff < 0) return { text: "期限切れ", cls: "overdue" };
    if (diff === 0) return { text: "本日", cls: "today" };
    return { text: `あと${diff}日`, cls: "" };
  }

  function renderHome() {
    renderProfile();

    // 最新体重
    const weights = Store.data.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
    const statWeight = $("#statWeight");
    const statDelta = $("#statWeightDelta");
    if (weights.length === 0) {
      statWeight.textContent = "--";
      statDelta.textContent = "";
    } else {
      const last = weights[weights.length - 1];
      statWeight.textContent = `${last.kg}kg`;
      if (weights.length >= 2) {
        const prev = weights[weights.length - 2];
        const d = Math.round((last.kg - prev.kg) * 10) / 10;
        statDelta.textContent = d === 0 ? "前回と同じ" : `前回比 ${d > 0 ? "+" : ""}${d}kg`;
      } else {
        statDelta.textContent = "";
      }
    }

    // 直近7日の散歩
    const since = Date.now() - 7 * 86400000;
    const recentWalks = Store.data.walks.filter((w) => fromKey(w.date).getTime() >= since);
    const totalMin = recentWalks.reduce((s, w) => s + (Number(w.duration) || 0), 0);
    $("#statWalk").textContent = `${recentWalks.length}回`;
    $("#statWalkSub").textContent = recentWalks.length ? `合計 ${totalMin}分` : "";

    // 次の予定
    const upcoming = Store.data.records
      .filter((r) => r.nextDate)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const statNext = $("#statNext");
    if (upcoming.length === 0) {
      statNext.textContent = "予定はありません";
    } else {
      const n = upcoming[0];
      const due = dueText(n.nextDate);
      statNext.textContent = `${recordTypeMeta(n.type).label} ・ ${due.text}`;
    }
  }

  /* ---------------- 体重タブ ---------------- */
  function renderWeightTab() {
    const list = Store.data.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
    drawWeightChart(list);

    const ul = $("#weightList");
    ul.innerHTML = "";
    if (list.length === 0) {
      $("#idealStatus").hidden = true;
    } else {
      const rev = list.slice().reverse();
      rev.forEach((w, i) => {
        const idx = list.length - 1 - i;
        const prev = list[idx - 1];
        const delta = prev ? Math.round((w.kg - prev.kg) * 10) / 10 : null;
        const li = document.createElement("li");
        li.className = "record-item";
        li.style.animationDelay = `${Math.min(i * 40, 240)}ms`;
        const d = fromKey(w.date);
        li.innerHTML = `
          <span class="record-icon" aria-hidden="true">⚖️</span>
          <span class="record-info">
            <span class="record-title">${w.kg}kg</span>
            <span class="record-sub">${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}${delta !== null ? ` ・ 前回比 ${delta > 0 ? "+" : ""}${delta}kg` : ""}</span>
          </span>
          <button class="record-delete" aria-label="削除">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
          </button>
        `;
        li.querySelector(".record-delete").addEventListener("click", () => {
          li.classList.add("removing");
          setTimeout(() => { Store.removeWeight(w.id); renderAll(); toast("削除しました"); }, 240);
        });
        ul.appendChild(li);
      });

      const p = Store.data.profile;
      const statusEl = $("#idealStatus");
      if (p.idealMin != null && p.idealMax != null) {
        const last = list[list.length - 1];
        statusEl.hidden = false;
        if (last.kg < p.idealMin) statusEl.textContent = `適正範囲（${p.idealMin}〜${p.idealMax}kg）よりやや軽めです`;
        else if (last.kg > p.idealMax) statusEl.textContent = `適正範囲（${p.idealMin}〜${p.idealMax}kg）よりやや重めです`;
        else statusEl.textContent = `適正体重の範囲内です 👍（${p.idealMin}〜${p.idealMax}kg）`;
      } else {
        statusEl.hidden = true;
      }
    }
  }

  function drawWeightChart(list) {
    const canvas = $("#weightChart");
    const ctx = canvas.getContext("2d");
    const empty = $("#weightEmpty");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (list.length === 0) { empty.hidden = false; return; }
    empty.hidden = true;

    const vals = list.map((w) => w.kg);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    min -= range * 0.15; max += range * 0.15;

    const padL = 30, padR = 10, padT = 14, padB = 22;
    const w = canvas.width - padL - padR, h = canvas.height - padT - padB;
    const stepX = list.length > 1 ? w / (list.length - 1) : 0;
    const xAt = (i) => padL + stepX * i;
    const yAt = (v) => padT + h - ((v - min) / (max - min)) * h;
    const bottom = padT + h;

    const profile = Store.data.profile;
    const duration = 650, t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (profile.idealMin != null && profile.idealMax != null) {
        const y1 = yAt(profile.idealMax), y2 = yAt(profile.idealMin);
        ctx.fillStyle = "rgba(108,122,68,0.14)";
        ctx.fillRect(padL, y1, w, y2 - y1);
      }

      ctx.strokeStyle = "rgba(120,100,70,0.25)";
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, bottom); ctx.lineTo(padL + w, bottom);
      ctx.stroke();

      ctx.beginPath();
      list.forEach((wt, i) => {
        const x = xAt(i);
        const trueY = yAt(wt.kg);
        const y = bottom - (bottom - trueY) * eased;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#bd5b2b";
      ctx.lineWidth = 2.4;
      ctx.lineJoin = "round";
      ctx.stroke();

      list.forEach((wt, i) => {
        const x = xAt(i);
        const trueY = yAt(wt.kg);
        const y = bottom - (bottom - trueY) * eased;
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = "#bd5b2b";
        ctx.fill();
      });

      const labelIdxs = list.length <= 4 ? list.map((_, i) => i) : [0, Math.floor((list.length - 1) / 2), list.length - 1];
      ctx.fillStyle = "#6b5c4e";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      labelIdxs.forEach((i) => {
        const d = fromKey(list[i].date);
        ctx.fillText(`${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`, xAt(i), bottom + 16);
      });

      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- お散歩タブ ---------------- */
  function renderWalkTab() {
    const since = Date.now() - 7 * 86400000;
    const recentWalks = Store.data.walks.filter((w) => fromKey(w.date).getTime() >= since);
    $("#walkWeekCount").textContent = `${recentWalks.length}回`;
    $("#walkWeekMin").textContent = `${recentWalks.reduce((s, w) => s + (Number(w.duration) || 0), 0)}分`;

    const list = Store.data.walks.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const ul = $("#walkList");
    ul.innerHTML = "";
    $("#walkEmpty").hidden = list.length !== 0;

    list.forEach((w, i) => {
      const li = document.createElement("li");
      li.className = "record-item";
      li.style.animationDelay = `${Math.min(i * 40, 240)}ms`;
      const d = fromKey(w.date);
      const riskChip = w.risk !== null && w.risk !== undefined
        ? `<span class="risk-chip risk-chip-${w.risk}">${RISK_INFO[w.risk].label}</span>`
        : "";
      li.innerHTML = `
        <span class="record-icon" aria-hidden="true">🚶</span>
        <span class="record-info">
          <span class="record-title">${w.duration}分のお散歩${w.memo ? ` ・ ${escapeHTML(w.memo)}` : ""}</span>
          <span class="record-sub">${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}${w.temp !== null && w.temp !== undefined ? ` ・ ${w.temp}℃${w.humidity !== null && w.humidity !== undefined ? `/${w.humidity}%` : ""}` : ""}</span>
        </span>
        <span class="record-side">${riskChip}</span>
        <button class="record-delete" aria-label="削除">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
        </button>
      `;
      li.querySelector(".record-delete").addEventListener("click", () => {
        li.classList.add("removing");
        setTimeout(() => { Store.removeWalk(w.id); renderAll(); toast("削除しました"); }, 240);
      });
      ul.appendChild(li);
    });
  }

  /* ---------------- 記録タブ ---------------- */
  const RECORD_TYPES = {
    hospital: { icon: "🏥", label: "通院" },
    medicine: { icon: "💊", label: "投薬" },
    vaccine: { icon: "💉", label: "ワクチン・フィラリア予防" },
    bath: { icon: "🛁", label: "シャンプー" },
    skinfold: { icon: "🧴", label: "しわ・皮膚のお手入れ" },
    ear: { icon: "👂", label: "耳そうじ" },
    nail: { icon: "💅", label: "爪切り" },
    other: { icon: "📝", label: "その他" },
  };

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildRecordItem(r, opts = {}) {
    const meta = recordTypeMeta(r.type);
    const d = fromKey(r.date);
    const li = document.createElement("li");
    li.className = "record-item";
    let sideHTML = "";
    if (opts.showDue && r.nextDate) {
      const due = dueText(r.nextDate);
      sideHTML = `<span class="due-chip ${due.cls}">${due.text}</span>`;
    }
    li.innerHTML = `
      <span class="record-icon" aria-hidden="true">${meta.icon}</span>
      <span class="record-info">
        <span class="record-title">${meta.label}${r.memo ? ` ・ ${escapeHTML(r.memo)}` : ""}</span>
        <span class="record-sub">${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}${r.nextDate ? ` ・ 次回 ${fromKey(r.nextDate).getMonth() + 1}/${fromKey(r.nextDate).getDate()}` : ""}</span>
      </span>
      <span class="record-side">${sideHTML}</span>
      <button class="record-delete" aria-label="削除">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
      </button>
    `;
    li.querySelector(".record-delete").addEventListener("click", () => {
      li.classList.add("removing");
      setTimeout(() => { Store.removeRecord(r.id); renderAll(); toast("削除しました"); }, 240);
    });
    return li;
  }

  function renderRecordTab() {
    const upcoming = Store.data.records.filter((r) => r.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const upUl = $("#upcomingList");
    upUl.innerHTML = "";
    $("#upcomingEmpty").hidden = upcoming.length !== 0;
    upcoming.forEach((r) => upUl.appendChild(buildRecordItem(r, { showDue: true })));

    const history = Store.data.records.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const hUl = $("#recordList");
    hUl.innerHTML = "";
    $("#recordEmpty").hidden = history.length !== 0;
    history.forEach((r) => hUl.appendChild(buildRecordItem(r)));
  }

  /* ---------------- 全体描画 ---------------- */
  function renderAll() {
    renderHome();
    renderWeightTab();
    renderWalkTab();
    renderRecordTab();
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
      if (btn.dataset.tab === "weight") drawWeightChart(Store.data.weights.slice().sort((a, b) => a.date.localeCompare(b.date)));
    });
  });

  /* ---------------- モーダル 開閉 ---------------- */
  function openModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (id === "weightModal") { $("#weightDate").value = todayKey(); $("#weightKg").value = ""; setTimeout(() => $("#weightKg").focus(), 200); }
    if (id === "walkModal") {
      $("#walkDate").value = todayKey();
      $("#walkDuration").value = "";
      $("#walkTemp").value = "";
      $("#walkHumidity").value = "";
      $("#walkMemo").value = "";
      $("#walkRiskPreview").hidden = true;
      setTimeout(() => $("#walkDuration").focus(), 200);
    }
    if (id === "recordModal") {
      $("#recordType").value = "hospital";
      $("#recordDate").value = todayKey();
      $("#recordMemo").value = "";
      $("#recordNextDate").value = "";
    }
    if (id === "profileModal") {
      const p = Store.data.profile;
      $("#profileName").value = p.name || "";
      $("#profileBreed").value = p.breed || "english";
      $("#profileBirthday").value = p.birthday || "";
      $("#profileIdealMin").value = p.idealMin ?? "";
      $("#profileIdealMax").value = p.idealMax ?? "";
      setTimeout(() => $("#profileName").focus(), 200);
    }
  }
  function closeModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) openModal(openBtn.dataset.open);
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) closeModal(closeBtn.dataset.close);
    if (e.target.classList.contains("modal-overlay")) e.target.hidden = true;
  });
  $("#editProfileBtn").addEventListener("click", () => openModal("profileModal"));

  /* ---------------- 体重 追加 ---------------- */
  $("#weightSubmitBtn").addEventListener("click", () => {
    const date = $("#weightDate").value || todayKey();
    const kg = Number($("#weightKg").value);
    if (!Number.isFinite(kg) || kg <= 0) { toast("体重を正しく入力してください"); $("#weightKg").focus(); return; }
    Store.addWeight({ id: uid(), date, kg: Math.round(kg * 10) / 10 });
    renderAll();
    closeModal("weightModal");
    toast("体重を記録しました");
  });

  /* ---------------- お散歩 追加 ---------------- */
  function walkPreview() {
    renderRiskBadge($("#walkRiskPreview"), $("#walkTemp").value, $("#walkHumidity").value);
  }
  $("#walkTemp").addEventListener("input", walkPreview);
  $("#walkHumidity").addEventListener("input", walkPreview);

  $("#walkSubmitBtn").addEventListener("click", () => {
    const date = $("#walkDate").value || todayKey();
    const duration = Number($("#walkDuration").value);
    if (!Number.isFinite(duration) || duration <= 0) { toast("時間を正しく入力してください"); $("#walkDuration").focus(); return; }
    const tempRaw = $("#walkTemp").value;
    const humidityRaw = $("#walkHumidity").value;
    const temp = tempRaw === "" ? null : Number(tempRaw);
    const humidity = humidityRaw === "" ? null : Number(humidityRaw);
    const risk = temp === null ? null : heatRiskLevel(temp, humidity);
    Store.addWalk({
      id: uid(), date, duration,
      temp, humidity, risk,
      memo: $("#walkMemo").value.trim(),
    });
    renderAll();
    closeModal("walkModal");
    toast("お散歩を記録しました");
  });

  /* ---------------- 記録 追加 ---------------- */
  $("#recordSubmitBtn").addEventListener("click", () => {
    const date = $("#recordDate").value || todayKey();
    const nextDate = $("#recordNextDate").value || null;
    Store.addRecord({
      id: uid(),
      type: $("#recordType").value,
      date,
      memo: $("#recordMemo").value.trim(),
      nextDate,
    });
    renderAll();
    closeModal("recordModal");
    toast("記録を追加しました");
  });

  /* ---------------- プロフィール 保存 ---------------- */
  $("#profileSubmitBtn").addEventListener("click", () => {
    const name = $("#profileName").value.trim();
    const idealMinRaw = $("#profileIdealMin").value;
    const idealMaxRaw = $("#profileIdealMax").value;
    const idealMin = idealMinRaw === "" ? null : Number(idealMinRaw);
    const idealMax = idealMaxRaw === "" ? null : Number(idealMaxRaw);
    if (idealMin !== null && idealMax !== null && idealMin > idealMax) {
      toast("適正体重の下限・上限を確認してください");
      return;
    }
    Store.saveProfile({
      name,
      breed: $("#profileBreed").value,
      birthday: $("#profileBirthday").value || null,
      idealMin, idealMax,
    });
    renderAll();
    closeModal("profileModal");
    toast("プロフィールを保存しました");
  });

  /* ---------------- ホーム 熱中症チェック ---------------- */
  function homeRiskCheck() {
    renderRiskBadge($("#homeRiskResult"), $("#homeTemp").value, $("#homeHumidity").value);
  }
  $("#homeTemp").addEventListener("input", homeRiskCheck);
  $("#homeHumidity").addEventListener("input", homeRiskCheck);

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
    if (action === "profile") openModal("profileModal");
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
    a.download = `buru-techo-${todayKey()}.json`;
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
    toast("インストールしました🐾");
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
