/* 免許みちしるべ — アプリ本体 */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const STORE_KEY = "menkyo:v1";

  const QUESTIONS = window.MENKYO_QUESTIONS || [];
  const CATEGORIES = window.MENKYO_CATEGORIES || [];
  const SIGNS = window.MENKYO_SIGNS || [];
  const SIGN_KINDS = window.MENKYO_SIGN_KINDS || [];
  const ROADMAP = window.MENKYO_ROADMAP || [];
  const CHECKLISTS = window.MENKYO_CHECKLISTS || [];

  const CAT_LABEL = {};
  CATEGORIES.forEach((c) => { CAT_LABEL[c.key] = c.label; });
  const KIND_LABEL = {};
  SIGN_KINDS.forEach((k) => { KIND_LABEL[k.key] = k.label; });

  const LOG_GROUPS = {
    skill1: { title: "技能教習・第一段階", items: window.MENKYO_SKILL_1 || [] },
    skill2: { title: "技能教習・第二段階", items: window.MENKYO_SKILL_2 || [] },
    gakka1: { title: "学科教習・第一段階", items: window.MENKYO_GAKKA_1 || [] },
    gakka2: { title: "学科教習・第二段階", items: window.MENKYO_GAKKA_2 || [] },
  };

  /* ================= 保存データ ================= */
  const emptyState = () => ({
    road: {}, packs: {}, skill1: {}, skill2: {}, gakka1: {}, gakka2: {},
    fees: [], memo: "", examDate: "", qstat: {}, signStat: {}, answered: 0, correct: 0,
  });

  let state = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && typeof raw === "object") return Object.assign(emptyState(), raw);
    } catch (e) { /* 壊れていたら初期値 */ }
    return emptyState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境 */ }
  }

  /* ================= 小道具 ================= */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pickWeighted(pool, n) {
    // 間違えた問題・未挑戦の問題が出やすくなる重み付き抽出
    const items = pool.map((q) => {
      const st = state.qstat[q.id] || { c: 0, w: 0 };
      let weight = 1 + st.w * 2.2;
      if (st.c === 0 && st.w === 0) weight += 0.8;
      if (st.last === "o") weight *= 0.55;
      return { q, key: Math.pow(Math.random(), 1 / Math.max(weight, 0.05)) };
    });
    items.sort((a, b) => b.key - a.key);
    return items.slice(0, Math.min(n, items.length)).map((x) => x.q);
  }
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2000);
  }
  function yen(n) { return Number(n || 0).toLocaleString("ja-JP") + "円"; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ================= タブ ================= */
  const TABS = ["road", "quiz", "signs", "log"];
  function showTab(name) {
    TABS.forEach((t) => { $("#tab-" + t).hidden = t !== name; });
    $$(".tab-btn").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  /* ================= 道のり ================= */
  function renderRoad() {
    const list = $("#roadList");
    list.innerHTML = "";
    const currentId = (ROADMAP.find((s) => !state.road[s.id]) || {}).id;

    ROADMAP.forEach((step, i) => {
      const done = !!state.road[step.id];
      const wrap = document.createElement("div");
      wrap.className = "road-step" + (done ? " is-done" : "") + (step.id === currentId ? " is-current" : "");
      wrap.innerHTML =
        `<div class="step-head">
           <button class="step-check" aria-label="${esc(step.title)}を完了にする" data-check="${step.id}">✓</button>
           <span class="step-icon" aria-hidden="true">${step.icon}</span>
           <span class="step-title"><span class="step-num">STEP ${i + 1}</span><b>${esc(step.title)}</b></span>
           <button class="step-toggle" aria-label="詳しく見る" data-toggle="${step.id}">▼</button>
         </div>
         <div class="step-body" hidden>
           <p>${esc(step.body)}</p>
           <ul>${step.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
         </div>`;
      list.appendChild(wrap);
    });

    const doneCount = ROADMAP.filter((s) => state.road[s.id]).length;
    const pct = ROADMAP.length ? Math.round((doneCount / ROADMAP.length) * 100) : 0;
    $("#roadPercent").textContent = String(pct);
    const circumference = 2 * Math.PI * 42;
    $("#roadRingFg").style.strokeDashoffset = String(circumference * (1 - pct / 100));

    const current = ROADMAP.find((s) => !state.road[s.id]);
    if (current) {
      $("#roadStepTitle").textContent = current.title;
      $("#roadStepHint").textContent = "いま取り組んでいるステップです。終わったらチェックを付けましょう。";
    } else {
      $("#roadStepTitle").textContent = "免許取得おめでとうございます！";
      $("#roadStepHint").textContent = "取得から1年間は初心運転者期間です。慣れるまでは、時間と道を選んで運転しましょう。";
    }
  }

  $("#roadList").addEventListener("click", (e) => {
    const check = e.target.closest("[data-check]");
    if (check) {
      const id = check.dataset.check;
      if (state.road[id]) delete state.road[id]; else state.road[id] = true;
      save();
      renderRoad();
      return;
    }
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const stepEl = toggle.closest(".road-step");
      const body = stepEl.querySelector(".step-body");
      body.hidden = !body.hidden;
      stepEl.classList.toggle("is-open", !body.hidden);
    }
  });

  function renderChecklists() {
    const area = $("#checklistArea");
    area.innerHTML = "";
    CHECKLISTS.forEach((cl) => {
      const doneCount = cl.items.filter((_, i) => state.packs[`${cl.id}:${i}`]).length;
      const wrap = document.createElement("div");
      wrap.className = "road-step" + (doneCount === cl.items.length ? " is-done" : "");
      wrap.innerHTML =
        `<div class="step-head">
           <span class="step-icon" aria-hidden="true">${cl.icon}</span>
           <span class="step-title"><b>${esc(cl.title)}</b><span class="step-num">${doneCount} / ${cl.items.length} 準備できた</span></span>
           <button class="step-toggle" aria-label="開く" data-toggle="${cl.id}">▼</button>
         </div>
         <div class="step-body" hidden style="padding-left:14px">
           ${cl.items.map((it, i) => {
             const on = state.packs[`${cl.id}:${i}`] ? " on" : "";
             return `<button class="check-item${on}" data-pack="${cl.id}:${i}"><span class="box">✓</span><span class="label">${esc(it)}</span></button>`;
           }).join("")}
         </div>`;
      area.appendChild(wrap);
    });
  }

  $("#checklistArea").addEventListener("click", (e) => {
    const pack = e.target.closest("[data-pack]");
    if (pack) {
      const key = pack.dataset.pack;
      if (state.packs[key]) delete state.packs[key]; else state.packs[key] = true;
      save();
      const openIds = $$("#checklistArea .road-step").map((el) => !el.querySelector(".step-body").hidden);
      renderChecklists();
      $$("#checklistArea .road-step").forEach((el, i) => {
        if (openIds[i]) { el.querySelector(".step-body").hidden = false; el.classList.add("is-open"); }
      });
      return;
    }
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const stepEl = toggle.closest(".road-step");
      const body = stepEl.querySelector(".step-body");
      body.hidden = !body.hidden;
      stepEl.classList.toggle("is-open", !body.hidden);
    }
  });

  function renderCountdown() {
    const input = $("#examDate");
    input.value = state.examDate || "";
    const box = $("#countdownValue");
    if (!state.examDate) { box.textContent = "--"; return; }
    const target = new Date(state.examDate + "T00:00:00");
    if (isNaN(target.getTime())) { box.textContent = "--"; return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((target - today) / 86400000);
    box.textContent = days > 0 ? `${days}日` : days === 0 ? "今日" : `${Math.abs(days)}日前`;
  }
  $("#examDate").addEventListener("change", (e) => {
    state.examDate = e.target.value;
    save();
    renderCountdown();
  });

  /* ================= 学科クイズ ================= */
  const MODES = {
    kari:   { label: "仮免模試", count: 50, timeSec: 30 * 60, pass: 45, instant: false },
    honmen: { label: "本免模試", count: 95, timeSec: 50 * 60, pass: 86, instant: false },
    random: { label: "おまかせ10問", count: 10, instant: true },
    weak:   { label: "弱点復習", count: 20, instant: true },
    trap:   { label: "ひっかけ道場", count: 20, instant: true },
    cat:    { label: "分野別練習", count: 10, instant: true },
  };

  let quiz = null; // {mode, questions, index, answers[], startedAt, timerId, remain}

  function weakPool() {
    return QUESTIONS.filter((q) => {
      const st = state.qstat[q.id];
      return st && st.last === "x";
    });
  }

  function startQuiz(modeKey, catKey) {
    const conf = Object.assign({}, MODES[modeKey]);
    let pool = QUESTIONS;
    if (modeKey === "weak") {
      pool = weakPool();
      if (pool.length === 0) { toast("まだ間違えた問題がありません"); return; }
      conf.count = Math.min(conf.count, pool.length);
    } else if (modeKey === "trap") {
      pool = QUESTIONS.filter((q) => q.trap);
      conf.count = Math.min(conf.count, pool.length);
    } else if (modeKey === "cat") {
      pool = QUESTIONS.filter((q) => q.cat === catKey);
      conf.label = (CAT_LABEL[catKey] || "分野別") + "の練習";
      conf.count = Math.min(conf.count, pool.length);
    }
    conf.count = Math.min(conf.count, pool.length);
    if (conf.count === 0) { toast("出題できる問題がありません"); return; }

    const picked = modeKey === "weak" || modeKey === "trap" ? shuffle(pool).slice(0, conf.count) : pickWeighted(pool, conf.count);
    quiz = {
      key: modeKey, conf, questions: shuffle(picked), index: 0,
      answers: [], remain: conf.timeSec || 0, timerId: null,
    };

    $("#quizHome").hidden = true;
    $("#quizResult").hidden = true;
    $("#quizPlay").hidden = false;
    $("#reviewList").hidden = true;

    if (conf.timeSec) {
      $("#quizTimer").hidden = false;
      tickTimer();
      quiz.timerId = setInterval(tickTimer, 1000);
    } else {
      $("#quizTimer").hidden = true;
    }
    renderQuestion();
  }

  function tickTimer() {
    if (!quiz) return;
    const el = $("#quizTimer");
    const m = Math.floor(quiz.remain / 60);
    const s = quiz.remain % 60;
    el.textContent = `${m}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("urgent", quiz.remain <= 60);
    if (quiz.remain <= 0) { finishQuiz(true); return; }
    quiz.remain -= 1;
  }

  function renderQuestion() {
    const q = quiz.questions[quiz.index];
    $("#qCategory").textContent = CAT_LABEL[q.cat] || "学科";
    $("#qText").textContent = q.q;
    $("#progressText").textContent = `第${quiz.index + 1}問 / ${quiz.questions.length}問`;
    $("#progressBar").style.width = `${(quiz.index / quiz.questions.length) * 100}%`;
    $("#feedbackCard").hidden = true;
    $$(".ox-btn").forEach((b) => {
      b.disabled = false;
      b.classList.remove("picked", "is-correct", "is-wrong");
    });
  }

  function answerQuestion(said) {
    if (!quiz) return;
    const q = quiz.questions[quiz.index];
    const ok = said === q.a;
    quiz.answers.push({ q, said, ok });

    const st = state.qstat[q.id] || { c: 0, w: 0 };
    if (ok) st.c += 1; else st.w += 1;
    st.last = ok ? "o" : "x";
    state.qstat[q.id] = st;
    state.answered += 1;
    if (ok) state.correct += 1;
    save();

    const btns = $$(".ox-btn");
    btns.forEach((b) => {
      b.disabled = true;
      const val = b.dataset.answer === "true";
      if (val === said) b.classList.add("picked");
      if (quiz.conf.instant) {
        if (val === q.a) b.classList.add("is-correct");
        else if (val === said) b.classList.add("is-wrong");
      }
    });

    if (quiz.conf.instant) {
      const head = $("#feedbackHead");
      head.textContent = ok ? "◯ 正解！" : "✕ 不正解";
      head.className = "feedback-head " + (ok ? "ok" : "ng");
      $("#feedbackExplain").textContent = `【答え：${q.a ? "◯" : "✕"}】${q.ex}`;
      $("#feedbackCard").hidden = false;
      $("#nextBtn").textContent = quiz.index + 1 >= quiz.questions.length ? "結果を見る" : "つぎへ";
      $("#feedbackCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      setTimeout(nextQuestion, 220);
    }
  }

  function nextQuestion() {
    if (!quiz) return;
    quiz.index += 1;
    if (quiz.index >= quiz.questions.length) { finishQuiz(false); return; }
    renderQuestion();
  }

  function finishQuiz(byTimeUp, aborted) {
    if (!quiz) return;
    if (quiz.timerId) clearInterval(quiz.timerId);
    const total = aborted ? quiz.answers.length : quiz.questions.length;
    const score = quiz.answers.filter((a) => a.ok).length;
    const pass = aborted ? 0 : quiz.conf.pass;
    const rate = total ? score / total : 0;
    const isPass = pass ? score >= pass : rate >= 0.9;

    $("#quizPlay").hidden = true;
    $("#quizResult").hidden = false;
    $("#reviewList").hidden = true;
    $("#resultScore").textContent = String(score);
    $("#resultTotal").textContent = String(total);
    $("#resultEmblem").textContent = isPass ? "🎉" : rate >= 0.7 ? "💪" : "📚";
    $("#resultTitle").textContent = aborted
      ? `${quiz.conf.label} 途中までの結果`
      : pass
        ? (isPass ? `${quiz.conf.label} 合格ライン到達！` : `${quiz.conf.label} 合格ラインまであと${Math.max(pass - score, 1)}問`)
        : `${quiz.conf.label} おつかれさま`;

    const bar = $("#resultBar");
    bar.className = "score-bar-fill " + (isPass ? "pass" : "fail");
    setTimeout(() => { bar.style.width = `${Math.round(rate * 100)}%`; }, 60);

    let comment;
    if (aborted) comment = `ここまでに解いた${total}問の結果です。続きはいつでも始められます。`;
    else if (byTimeUp) comment = "時間切れです。本番も時間配分が大切。分からない問題は印を付けて先に進みましょう。";
    else if (isPass) comment = pass ? "この調子です。本番では見直しの時間も確保しましょう。" : "よくできました。間違えた問題は解説を読んでおきましょう。";
    else if (rate >= 0.7) comment = "あと一歩です。間違えた問題は「弱点復習」に入っています。";
    else comment = "分野別練習で、苦手な分野からゆっくり固めていきましょう。";
    $("#resultComment").textContent = comment;

    const byCat = {};
    quiz.answers.forEach((a) => {
      const k = a.q.cat;
      byCat[k] = byCat[k] || { c: 0, t: 0 };
      byCat[k].t += 1;
      if (a.ok) byCat[k].c += 1;
    });
    $("#resultCats").innerHTML = Object.keys(byCat).map((k) => {
      const v = byCat[k];
      const p = Math.round((v.c / v.t) * 100);
      return `<div class="result-cat"><span class="rc-name">${esc(CAT_LABEL[k] || k)}</span>` +
        `<span class="rc-track"><span class="rc-fill" style="width:${p}%"></span></span>` +
        `<span class="rc-num">${v.c}/${v.t}</span></div>`;
    }).join("");

    const wrongs = quiz.answers.filter((a) => !a.ok);
    $("#reviewBtn").hidden = wrongs.length === 0;
    $("#reviewList").innerHTML = wrongs.map((a) =>
      `<div class="review-item">
         <p class="ri-q">${esc(a.q.q)}</p>
         <p class="ri-meta ng">あなたの答え：${a.said ? "◯" : "✕"} ／ 正解：${a.q.a ? "◯" : "✕"}</p>
         <p class="ri-ex">${esc(a.q.ex)}</p>
       </div>`).join("");

    quiz.finished = true;
    refreshQuizHome();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToQuizHome() {
    if (quiz && quiz.timerId) clearInterval(quiz.timerId);
    quiz = null;
    $("#quizPlay").hidden = true;
    $("#quizResult").hidden = true;
    $("#quizHome").hidden = false;
    refreshQuizHome();
  }

  function refreshQuizHome() {
    const ids = Object.keys(state.qstat);
    const mastered = ids.filter((id) => state.qstat[id].last === "o").length;
    const weak = weakPool().length;
    $("#statAnswered").textContent = String(state.answered);
    $("#statRate").textContent = state.answered ? Math.round((state.correct / state.answered) * 100) + "%" : "--";
    $("#statWeak").textContent = String(weak);
    const pct = QUESTIONS.length ? Math.round((mastered / QUESTIONS.length) * 100) : 0;
    $("#masteryBar").style.width = pct + "%";
    $("#masteryText").textContent = state.answered
      ? `全${QUESTIONS.length}問のうち ${mastered}問を正解済み（${pct}%）`
      : `全${QUESTIONS.length}問。まずは「おまかせ10問」から始めましょう`;
    $("#weakCountText").textContent = weak > 0 ? `間違えた問題が${weak}問たまっています` : "間違えた問題だけを解き直す";

    $("#catList").innerHTML = CATEGORIES.map((c) => {
      const pool = QUESTIONS.filter((q) => q.cat === c.key);
      const ok = pool.filter((q) => (state.qstat[q.id] || {}).last === "o").length;
      const p = pool.length ? Math.round((ok / pool.length) * 100) : 0;
      return `<button class="cat-btn" data-cat="${c.key}">
          <span class="cat-name">${c.emoji} ${esc(c.label)}</span>
          <span class="cat-track"><span class="cat-fill" style="width:${p}%"></span></span>
          <span class="cat-meta">${ok} / ${pool.length}問 正解済み</span>
        </button>`;
    }).join("");
  }

  $$(".mode-card").forEach((b) => b.addEventListener("click", () => startQuiz(b.dataset.mode)));
  $("#catList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (btn) startQuiz("cat", btn.dataset.cat);
  });
  $$(".ox-btn").forEach((b) => b.addEventListener("click", () => answerQuestion(b.dataset.answer === "true")));
  $("#nextBtn").addEventListener("click", nextQuestion);
  $("#quitBtn").addEventListener("click", () => {
    if (quiz && quiz.answers.length > 0 && !quiz.finished) { finishQuiz(false, true); return; }
    backToQuizHome();
  });
  $("#retryBtn").addEventListener("click", () => {
    const key = quiz ? quiz.key : "random";
    const cat = quiz && quiz.key === "cat" ? quiz.questions[0].cat : undefined;
    backToQuizHome();
    startQuiz(key, cat);
  });
  $("#reviewBtn").addEventListener("click", () => {
    const list = $("#reviewList");
    list.hidden = !list.hidden;
    $("#reviewBtn").textContent = list.hidden ? "まちがえた問題を見る" : "まちがえた問題を閉じる";
    if (!list.hidden) list.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#backHomeBtn").addEventListener("click", backToQuizHome);

  /* ================= 標識 ================= */
  let signFilter = "all";
  let signQuiz = null;

  function signSvg(sign, cls) {
    return `<svg viewBox="0 0 120 120" class="${cls || ""}" role="img" aria-label="${esc(sign.name)}">${sign.svg}</svg>`;
  }

  function renderSignFilter() {
    const chips = [{ key: "all", label: "すべて" }].concat(SIGN_KINDS.map((k) => ({ key: k.key, label: k.label })));
    $("#signFilter").innerHTML = chips.map((c) =>
      `<button class="chip${signFilter === c.key ? " is-on" : ""}" data-kind="${c.key}">${esc(c.label)}</button>`).join("");
  }

  function renderSignBook() {
    const list = signFilter === "all" ? SIGNS : SIGNS.filter((s) => s.kind === signFilter);
    $("#signGrid").innerHTML = list.map((s) =>
      `<button class="sign-card" data-sign="${s.id}">
         ${signSvg(s)}
         <span class="sc-name">${esc(s.name)}</span>
         <span class="sc-kind">${esc(KIND_LABEL[s.kind] || "")}</span>
         <span class="sc-desc" hidden>${esc(s.desc)}</span>
       </button>`).join("");
  }

  $("#signFilter").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-kind]");
    if (!chip) return;
    signFilter = chip.dataset.kind;
    renderSignFilter();
    renderSignBook();
  });
  $("#signGrid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-sign]");
    if (!card) return;
    const desc = card.querySelector(".sc-desc");
    desc.hidden = !desc.hidden;
  });

  $$("[data-signview]").forEach((b) => b.addEventListener("click", () => {
    const view = b.dataset.signview;
    $$("[data-signview]").forEach((x) => x.classList.toggle("is-on", x === b));
    $("#signBook").hidden = view !== "book";
    $("#signQuiz").hidden = view !== "quiz";
    if (view === "quiz" && !signQuiz) startSignQuiz();
  }));

  function startSignQuiz() {
    const count = Math.min(10, SIGNS.length);
    signQuiz = { list: shuffle(SIGNS).slice(0, count), index: 0, score: 0 };
    $("#signResult").hidden = true;
    $("#signFeedback").hidden = true;
    $("#signChoices").hidden = false;
    $(".sign-question").hidden = false;
    renderSignQuestion();
  }

  function renderSignQuestion() {
    const s = signQuiz.list[signQuiz.index];
    $("#signFigure").innerHTML = signSvg(s);
    $("#signProgress").textContent = `第${signQuiz.index + 1}問 / ${signQuiz.list.length}問`;
    $("#signScoreText").textContent = `正解 ${signQuiz.score}`;
    $("#signProgressBar").style.width = `${(signQuiz.index / signQuiz.list.length) * 100}%`;

    const sameKind = SIGNS.filter((x) => x.kind === s.kind && x.id !== s.id);
    const others = SIGNS.filter((x) => x.kind !== s.kind && x.id !== s.id);
    const distractors = shuffle(sameKind).slice(0, 3);
    while (distractors.length < 3) {
      const cand = shuffle(others).find((o) => !distractors.includes(o));
      if (!cand) break;
      distractors.push(cand);
    }
    const choices = shuffle([s].concat(distractors));
    $("#signChoices").innerHTML = choices.map((c) =>
      `<button class="choice-btn" data-pick="${c.id}">${esc(c.name)}</button>`).join("");
    $("#signFeedback").hidden = true;
  }

  $("#signChoices").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick]");
    if (!btn || !signQuiz) return;
    const s = signQuiz.list[signQuiz.index];
    const ok = btn.dataset.pick === s.id;
    if (ok) signQuiz.score += 1;

    const st = state.signStat[s.id] || { c: 0, w: 0 };
    if (ok) st.c += 1; else st.w += 1;
    state.signStat[s.id] = st;
    save();

    $$("#signChoices .choice-btn").forEach((b) => {
      b.disabled = true;
      if (b.dataset.pick === s.id) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    const head = $("#signFeedbackHead");
    head.textContent = ok ? "◯ 正解！" : `✕ 正解は「${s.name}」`;
    head.className = "feedback-head " + (ok ? "ok" : "ng");
    $("#signFeedbackText").textContent = s.desc;
    $("#signFeedback").hidden = false;
    $("#signScoreText").textContent = `正解 ${signQuiz.score}`;
    $("#signNextBtn").textContent = signQuiz.index + 1 >= signQuiz.list.length ? "結果を見る" : "つぎへ";
  });

  $("#signNextBtn").addEventListener("click", () => {
    if (!signQuiz) return;
    signQuiz.index += 1;
    if (signQuiz.index >= signQuiz.list.length) {
      $(".sign-question").hidden = true;
      $("#signChoices").hidden = true;
      $("#signFeedback").hidden = true;
      $("#signProgressBar").style.width = "100%";
      $("#signResultScore").textContent = String(signQuiz.score);
      $("#signResultComment").textContent = signQuiz.score >= 9
        ? "標識はほぼ完璧です。学科試験でも得点源になります。"
        : signQuiz.score >= 6
          ? "あと少し。形と色（円は規制、黄色のひし形は警戒、青は指示）で整理すると覚えやすくなります。"
          : "まずは図鑑をひと通り眺めてみましょう。似た標識を並べて見ると違いがつかめます。";
      $("#signResult").hidden = false;
      return;
    }
    renderSignQuestion();
  });
  $("#signRetryBtn").addEventListener("click", startSignQuiz);
  $("#signToBookBtn").addEventListener("click", () => {
    $$("[data-signview]").forEach((x) => x.classList.toggle("is-on", x.dataset.signview === "book"));
    $("#signBook").hidden = false;
    $("#signQuiz").hidden = true;
  });
  $("#signQuitBtn").addEventListener("click", () => {
    signQuiz = null;
    $$("[data-signview]").forEach((x) => x.classList.toggle("is-on", x.dataset.signview === "book"));
    $("#signBook").hidden = false;
    $("#signQuiz").hidden = true;
  });

  /* ================= 教習記録 ================= */
  let logView = "skill1";

  function renderLogSummary() {
    const rows = [
      { name: "技能・第一段階", key: "skill1" },
      { name: "技能・第二段階", key: "skill2" },
      { name: "学科・第一段階", key: "gakka1" },
      { name: "学科・第二段階", key: "gakka2" },
    ];
    $("#logSummary").innerHTML = rows.map((r) => {
      const total = LOG_GROUPS[r.key].items.length;
      const done = Object.keys(state[r.key] || {}).length;
      const p = total ? Math.round((done / total) * 100) : 0;
      return `<div class="log-row"><span class="lr-name">${esc(r.name)}</span>` +
        `<span class="lr-track"><span class="lr-fill" style="width:${p}%"></span></span>` +
        `<span class="lr-num">${done}/${total}</span></div>`;
    }).join("");
  }

  function renderLogList() {
    const groups = logView === "gakka" ? ["gakka1", "gakka2"] : [logView];
    $("#logList").innerHTML = groups.map((g) => {
      const items = LOG_GROUPS[g].items.map((label, i) => {
        const on = state[g][i] ? " on" : "";
        return `<button class="check-item${on}" data-log="${g}:${i}"><span class="box">✓</span><span class="label">${i + 1}. ${esc(label)}</span></button>`;
      }).join("");
      return `<div class="log-group-title">${esc(LOG_GROUPS[g].title)}</div>${items}`;
    }).join("");
  }

  $$("[data-logview]").forEach((b) => b.addEventListener("click", () => {
    logView = b.dataset.logview;
    $$("[data-logview]").forEach((x) => x.classList.toggle("is-on", x === b));
    renderLogList();
  }));

  $("#logList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-log]");
    if (!btn) return;
    const [group, idx] = btn.dataset.log.split(":");
    if (state[group][idx]) delete state[group][idx]; else state[group][idx] = true;
    save();
    btn.classList.toggle("on");
    renderLogSummary();
  });

  function renderFees() {
    const list = $("#feeList");
    if (!state.fees.length) {
      list.innerHTML = `<p class="fee-empty">まだ登録がありません。項目と金額を入れて追加するか、目安の内訳を読み込んでください。</p>`;
    } else {
      list.innerHTML = state.fees.map((f, i) =>
        `<div class="fee-row"><span class="fr-label">${esc(f.label)}</span>` +
        `<span class="fr-amount">${yen(f.amount)}</span>` +
        `<button class="fr-del" data-fee="${i}" aria-label="${esc(f.label)}を削除">✕</button></div>`).join("");
    }
    const total = state.fees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    $("#feeTotal").textContent = yen(total);
  }

  $("#feeAddBtn").addEventListener("click", () => {
    const label = $("#feeLabel").value.trim();
    const amount = Number($("#feeAmount").value);
    if (!label) { toast("項目名を入れてください"); return; }
    if (!Number.isFinite(amount) || amount < 0) { toast("金額を数字で入れてください"); return; }
    state.fees.push({ label, amount: Math.round(amount) });
    save();
    $("#feeLabel").value = "";
    $("#feeAmount").value = "";
    renderFees();
  });
  $("#feeList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-fee]");
    if (!del) return;
    state.fees.splice(Number(del.dataset.fee), 1);
    save();
    renderFees();
  });
  $("#feeTemplateBtn").addEventListener("click", () => {
    const tpl = window.MENKYO_FEE_TEMPLATE || [];
    const existing = new Set(state.fees.map((f) => f.label));
    let added = 0;
    tpl.forEach((t) => {
      if (!existing.has(t.label)) { state.fees.push({ label: t.label, amount: t.amount }); added += 1; }
    });
    save();
    renderFees();
    toast(added ? `目安${added}件を読み込みました（金額は書き換えられます）` : "すでに読み込み済みです");
  });

  let memoTimer = null;
  $("#memoBox").addEventListener("input", (e) => {
    clearTimeout(memoTimer);
    const v = e.target.value;
    memoTimer = setTimeout(() => { state.memo = v; save(); }, 400);
  });

  /* ================= メニュー・モーダル ================= */
  const menuPanel = $("#menuPanel");
  const menuScrim = $("#menuScrim");
  function closeMenu() {
    menuPanel.hidden = true;
    menuScrim.hidden = true;
    $("#menuBtn").setAttribute("aria-expanded", "false");
  }
  $("#menuBtn").addEventListener("click", () => {
    const open = menuPanel.hidden;
    menuPanel.hidden = !open;
    menuScrim.hidden = !open;
    $("#menuBtn").setAttribute("aria-expanded", String(open));
  });
  menuScrim.addEventListener("click", closeMenu);

  function openModal(id) { $("#" + id).hidden = false; }
  function closeModal(id) { $("#" + id).hidden = true; }
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
  $$(".modal-overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; }));

  menuPanel.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-item");
    if (!btn) return;
    closeMenu();
    const action = btn.dataset.action;
    if (action === "howto") openModal("howtoModal");
    else if (action === "traps") openModal("trapsModal");
    else if (action === "about") openModal("aboutModal");
    else if (action === "reset") openModal("confirmModal");
    else if (action === "install") doInstall();
  });

  $("#confirmResetBtn").addEventListener("click", () => {
    state = emptyState();
    save();
    closeModal("confirmModal");
    renderAll();
    backToQuizHome();
    toast("記録をすべて消しました");
  });

  $("#trapsBody").innerHTML = (window.MENKYO_TRAP_WORDS || []).map((t) =>
    `<div class="trap-item"><b>「${esc(t.word)}」</b><p>${esc(t.note)}</p></div>`).join("");

  /* ================= インストール ================= */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("#installMenuItem").hidden = false;
  });
  function doInstall() {
    if (!deferredPrompt) { toast("お使いのブラウザの共有メニューから追加できます"); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
      $("#installMenuItem").hidden = true;
    });
  }
  window.addEventListener("appinstalled", () => { $("#installMenuItem").hidden = true; });

  /* ================= 初期化 ================= */
  function renderAll() {
    renderRoad();
    renderChecklists();
    renderCountdown();
    refreshQuizHome();
    renderSignFilter();
    renderSignBook();
    renderLogSummary();
    renderLogList();
    renderFees();
    $("#memoBox").value = state.memo || "";
  }
  renderAll();

  if (!localStorage.getItem("menkyo:seen")) {
    try { localStorage.setItem("menkyo:seen", "1"); } catch (e) { /* 無視 */ }
    openModal("howtoModal");
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* オフライン非対応でも動作する */ });
    });
  }
})();
