(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const STATS_KEY = "ginbura:stats";
  const QUESTION_TIME_MS = 20000;
  const ROUND_SIZE = 10;

  const ALL_QUESTIONS = window.GINBURA_QUESTIONS || [];

  let quizQuestions = [];
  let currentIndex = 0;
  let score = 0;
  let answers = [];
  let answered = false;
  let timerInterval = null;
  let timeLeft = QUESTION_TIME_MS;

  const screens = {
    start: $("#startScreen"),
    quiz: $("#quizScreen"),
    result: $("#resultScreen"),
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
  }

  /* ================= 統計 ================= */
  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem(STATS_KEY)) || { best: null, playCount: 0 };
    } catch (e) {
      return { best: null, playCount: 0 };
    }
  }
  function saveStats(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
  }
  function refreshStartStats() {
    const stats = loadStats();
    $("#bestScoreValue").textContent = stats.best == null ? "--" : `${stats.best}/10`;
    $("#playCountValue").textContent = String(stats.playCount || 0);
  }

  /* ================= クイズ進行 ================= */
  function startQuiz() {
    const pool = shuffle(ALL_QUESTIONS);
    quizQuestions = pool.slice(0, Math.min(ROUND_SIZE, pool.length));
    currentIndex = 0;
    score = 0;
    answers = [];
    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    stopTimer();
    answered = false;
    const q = quizQuestions[currentIndex];
    $("#progressText").textContent = `第${currentIndex + 1}問 / ${quizQuestions.length}問`;
    $("#quizScoreText").textContent = `正解 ${score}`;
    const catEl = $("#qCategory");
    catEl.textContent = q.category;
    catEl.classList.toggle("is-iq", q.category === "IQ");
    $("#qText").textContent = q.q;
    $("#feedbackCard").hidden = true;

    const list = $("#choicesList");
    list.innerHTML = "";
    q.choices.forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.innerHTML = `<span class="choice-mark">${i + 1}</span><span>${choice}</span>`;
      btn.addEventListener("click", () => selectChoice(i));
      list.appendChild(btn);
    });

    startTimer();
  }

  function startTimer() {
    timeLeft = QUESTION_TIME_MS;
    const bar = $("#timerBar");
    bar.classList.remove("urgent");
    bar.style.width = "100%";
    timerInterval = setInterval(() => {
      timeLeft -= 100;
      const pct = Math.max(0, (timeLeft / QUESTION_TIME_MS) * 100);
      bar.style.width = pct + "%";
      if (timeLeft <= 5000) bar.classList.add("urgent");
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        selectChoice(-1);
      }
    }, 100);
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function selectChoice(chosenIndex) {
    if (answered) return;
    answered = true;
    stopTimer();
    const q = quizQuestions[currentIndex];
    const isCorrect = chosenIndex === q.correct;
    if (isCorrect) score++;
    answers.push({ q, chosenIndex, correct: isCorrect });

    const buttons = $("#choicesList").querySelectorAll(".choice-btn");
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correct) btn.classList.add("correct");
      else if (i === chosenIndex) btn.classList.add("wrong");
      else btn.classList.add("dim");
    });

    $("#quizScoreText").textContent = `正解 ${score}`;
    const head = $("#feedbackHead");
    head.textContent = chosenIndex === -1 ? "時間切れ..." : (isCorrect ? "正解！" : "残念...");
    head.className = "feedback-head " + (isCorrect ? "ok" : "ng");
    $("#feedbackExplain").textContent = q.explain;
    $("#feedbackCard").hidden = false;
  }

  $("#nextBtn").addEventListener("click", () => {
    currentIndex++;
    if (currentIndex >= quizQuestions.length) showResult();
    else renderQuestion();
  });

  /* ================= 結果 ================= */
  function rankFor(score) {
    if (score >= 10) return { title: "銀座マイスター", emblem: "👑", comment: "満点です！もう銀座の生き字引ですね。" };
    if (score >= 8) return { title: "銀ブラ通（つう）", emblem: "🎩", comment: "かなりの銀座通！あと少しで満点でした。" };
    if (score >= 6) return { title: "銀座ファン", emblem: "🌟", comment: "銀座のことをよく知っていますね。" };
    if (score >= 4) return { title: "銀座見習い", emblem: "🌱", comment: "まずまず！もう一度挑戦してレベルアップしましょう。" };
    return { title: "銀座ビギナー", emblem: "🔰", comment: "これから銀座通を目指しましょう！" };
  }

  function iqFor(score) {
    return 85 + score * 6;
  }

  function showResult() {
    stopTimer();
    const rank = rankFor(score);
    $("#resultEmblem").textContent = rank.emblem;
    $("#resultRank").textContent = rank.title;
    $("#resultScoreValue").textContent = String(score);
    $("#resultIqValue").textContent = String(iqFor(score));
    $("#resultComment").textContent = rank.comment;

    const stats = loadStats();
    stats.playCount = (stats.playCount || 0) + 1;
    let isNewBest = false;
    if (stats.best == null || score > stats.best) { stats.best = score; isNewBest = true; }
    saveStats(stats);
    $("#resultNewBest").hidden = !isNewBest;

    $("#reviewList").hidden = true;
    $("#reviewList").innerHTML = "";
    $("#reviewBtn").textContent = "今回の問題を振り返る";

    showScreen("result");
  }

  $("#retryBtn").addEventListener("click", startQuiz);
  $("#startBtn").addEventListener("click", startQuiz);

  $("#reviewBtn").addEventListener("click", () => {
    const list = $("#reviewList");
    if (!list.hidden) { list.hidden = true; $("#reviewBtn").textContent = "今回の問題を振り返る"; return; }
    if (!list.childElementCount) {
      answers.forEach((a) => {
        const item = document.createElement("div");
        item.className = "review-item";
        const mark = a.correct ? "✅" : "❌";
        const yourAnswer = a.chosenIndex === -1 ? "（未回答・時間切れ）" : a.q.choices[a.chosenIndex];
        item.innerHTML = `
          <div class="ri-q"><span class="ri-mark">${mark}</span><span>${a.q.q}</span></div>
          <div class="ri-answer">正解：${a.q.choices[a.q.correct]}${a.correct ? "" : `　／　あなたの回答：${yourAnswer}`}</div>
        `;
        list.appendChild(item);
      });
    }
    list.hidden = false;
    $("#reviewBtn").textContent = "振り返りを閉じる";
  });

  /* ================= UI: メニュー・モーダル・トースト ================= */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  $("#howtoBtn").addEventListener("click", () => openModal("#howtoModal"));
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
    if (action === "howto") openModal("#howtoModal");
    else if (action === "restart") { stopTimer(); refreshStartStats(); showScreen("start"); }
    else if (action === "resetscore") { saveStats({ best: null, playCount: 0 }); refreshStartStats(); toast("記録をリセットしました"); }
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
  window.addEventListener("appinstalled", () => { installMenuItem.hidden = true; toast("インストールしました🏙️"); });
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
  refreshStartStats();
  showScreen("start");
})();
