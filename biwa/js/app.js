import { db, requestPersist } from "./db.js";
import { importFile, parsePasted, parseAozora, plainLength, looksJapanese } from "./parse.js";
import { createReader, FONTS } from "./reader.js";
import { heroSVG, coverHTML, petalBurst } from "./art.js";
import { SAMPLE_STORY, SAMPLE_GUIDE } from "./samples.js";

/* =========================================================
   小さな道具
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function fmtMin(min) {
  min = Math.round(min);
  if (min < 1) return "1分未満";
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}
function fmtDate(t) {
  const d = new Date(t);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

let toastTimer;
function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/* =========================================================
   設定・記録（localStorage）
   ========================================================= */
const DEFAULTS = {
  mode: "auto", flow: "page", font: "mincho", size: 19, lh: 1.85, ls: 0.02, margin: 26,
  theme: "urushi", bright: 1, anim: "slide", tap: "std", justify: true, bold: false, spread: true,
  wake: true, ttsRate: 1, autoSec: 20,
};
function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
const settings = { ...DEFAULTS, ...loadJSON("hb.settings", {}) };
const saveSettings = () => localStorage.setItem("hb.settings", JSON.stringify(settings));
// 黒と金の新しい意匠へ：一度だけ読書面の色を「漆」にそろえる
if (localStorage.getItem("hb.design") !== "urushi") {
  settings.theme = "urushi";
  localStorage.setItem("hb.design", "urushi");
  saveSettings();
}

const stats = Object.assign({ days: {}, books: {}, speed: 500, goal: 15, finished: 0 }, loadJSON("hb.stats", {}));
const saveStats = () => localStorage.setItem("hb.stats", JSON.stringify(stats));
function dayRec(k = todayKey()) {
  if (!stats.days[k]) stats.days[k] = { sec: 0, chars: 0 };
  return stats.days[k];
}

/* =========================================================
   本棚
   ========================================================= */
let books = [];
let shelfFilter = "all";

async function loadBooks() {
  books = await db.allBooks();
}

function bookPercent(b) {
  return clamp(b.percent || 0, 0, 1);
}

function sortBooks(list, mode) {
  const by = {
    recent: (a, b) => (b.opened || b.added) - (a.opened || a.added),
    added: (a, b) => b.added - a.added,
    title: (a, b) => a.title.localeCompare(b.title, "ja"),
    author: (a, b) => (a.author || "").localeCompare(b.author || "", "ja") || a.title.localeCompare(b.title, "ja"),
    progress: (a, b) => bookPercent(b) - bookPercent(a),
  }[mode] || (() => 0);
  return [...list].sort(by);
}

function renderShelf() {
  const q = $("#shelfSearch").value.trim().toLowerCase();
  let list = books.filter((b) => !q || `${b.title} ${b.author}`.toLowerCase().includes(q));
  if (shelfFilter === "reading") list = list.filter((b) => !b.finished && bookPercent(b) > 0);
  if (shelfFilter === "unread") list = list.filter((b) => !b.finished && bookPercent(b) === 0);
  if (shelfFilter === "done") list = list.filter((b) => b.finished);
  list = sortBooks(list, $("#shelfSort").value);

  $("#shelf").innerHTML = list.map((b) => {
    const pct = Math.round(bookPercent(b) * 100);
    const badge = b.finished ? '<span class="badge done">読了</span>' : pct === 0 ? '<span class="badge new">未読</span>' : "";
    return `<article class="book-card" data-id="${b.id}">
      <button class="book-open" data-open="${b.id}" aria-label="『${esc(b.title)}』を開く">
        ${coverHTML(b)}
        ${badge}
      </button>
      <div class="book-meta">
        <h3 title="${esc(b.title)}">${esc(b.title)}</h3>
        <p>${esc(b.author || "　")}</p>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="book-foot"><small>${b.finished ? "読了" : `${pct}%`}</small><button class="more-btn" data-more="${b.id}" aria-label="『${esc(b.title)}』の詳細">⋯</button></div>
      </div>
    </article>`;
  }).join("");
  $("#shelfEmpty").hidden = books.length > 0;

  // 続きを読む
  const last = sortBooks(books.filter((b) => b.opened && !b.finished), "recent")[0];
  const card = $("#continueCard");
  if (last) {
    const pct = Math.round(bookPercent(last) * 100);
    const left = Math.max(0, (last.chars || 0) * (1 - bookPercent(last))) / stats.speed;
    card.hidden = false;
    card.innerHTML = `
      <div class="cc-cover">${coverHTML(last)}</div>
      <div class="cc-body">
        <small>続きを読む</small>
        <h3>${esc(last.title)}</h3>
        <p>${esc(last.posLabel || "")}</p>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <small class="cc-left">${pct}% ・ 読み終えるまで約${fmtMin(left)}</small>
      </div>
      <button class="btn btn-primary" data-open="${last.id}">開く</button>`;
  } else {
    card.hidden = true;
    card.innerHTML = "";
  }
}

async function saveParsed(parsed, extra = {}) {
  const id = uid();
  const secChars = parsed.sections.map((s) => plainLength(s.html));
  const total = secChars.reduce((a, b) => a + b, 0);
  const dup = books.find((b) => b.title === parsed.title && (b.author || "") === (parsed.author || "") && b.chars === total);
  if (dup && !extra.allowDup) return { dup };
  const meta = {
    id,
    title: parsed.title || "無題",
    author: parsed.author || "",
    cover: parsed.cover || null,
    dir: parsed.dir || "v",
    lang: looksJapanese(parsed.sections.slice(0, 2).map((s) => s.html.replace(/<[^>]+>/g, "")).join("")) ? "ja" : "en",
    format: parsed.format,
    toc: parsed.toc,
    secTitles: parsed.sections.map((s) => s.title || ""),
    secChars,
    chars: total,
    added: Date.now(),
    opened: 0,
    pos: null,
    percent: 0,
    finished: false,
    bookmarks: [],
    highlights: [],
    ...extra,
  };
  delete meta.allowDup;
  await db.putContent({ id, sections: parsed.sections.map((s) => ({ title: s.title || "", html: s.html })) });
  await db.putBook(meta);
  books.push(meta);
  return { meta };
}

async function importFiles(files) {
  let added = 0;
  for (const f of files) {
    toast(`「${f.name}」を読み込んでいます…`, 60000);
    try {
      const parsed = await importFile(f);
      const r = await saveParsed(parsed);
      if (r.dup) toast(`『${r.dup.title}』はすでに本棚にあります`);
      else { added++; toast(`『${r.meta.title}』を本棚に入れました`); }
    } catch (e) {
      console.error(e);
      toast(`「${f.name}」を読み込めませんでした：${e.message || e}`, 5000);
    }
  }
  renderShelf();
  if (added) { closeSheet(); go("library"); }
}

async function seedBooks() {
  if (localStorage.getItem("hb.seeded")) return;
  const story = parseAozora(SAMPLE_STORY, "金地の四弦.txt");
  await saveParsed(story, { builtin: true, added: Date.now() - 1000 });
  const guide = parseAozora(SAMPLE_GUIDE, "花琵琶文庫の手引き.txt");
  await saveParsed(guide, { builtin: true, added: Date.now() });
  localStorage.setItem("hb.seeded", "1");
}

/* =========================================================
   画面の切り替え
   ========================================================= */
function go(view) {
  for (const v of $$(".view")) v.hidden = v.dataset.view !== view;
  for (const b of $$(".nav-btn")) b.classList.toggle("active", b.dataset.go === view);
  if (view === "library") renderShelf();
  if (view === "stats") renderStats();
  if (view === "notes") renderNotes();
  if (view === "settings") renderSettings();
  window.scrollTo({ top: 0 });
}

/* =========================================================
   シート（下から出るパネル）
   ========================================================= */
let sheetOnClose = null;
function openSheet(title, html, { wide = false, onClose = null, cls = "" } = {}) {
  $("#sheetTitle").textContent = title;
  const body = $("#sheetBody");
  body.innerHTML = html;
  const sh = $("#sheet");
  sh.className = `sheet ${wide ? "wide" : ""} ${cls}`;
  sh.hidden = false;
  $("#sheetBackdrop").hidden = false;
  requestAnimationFrame(() => { sh.classList.add("open"); $("#sheetBackdrop").classList.add("open"); });
  sheetOnClose = onClose;
  body.scrollTop = 0;
  return body;
}
function closeSheet() {
  const sh = $("#sheet");
  if (sh.hidden) return;
  sh.classList.remove("open");
  $("#sheetBackdrop").classList.remove("open");
  setTimeout(() => { sh.hidden = true; $("#sheetBackdrop").hidden = true; }, 220);
  const cb = sheetOnClose;
  sheetOnClose = null;
  cb?.();
}
const sheetOpen = () => !$("#sheet").hidden;

/* =========================================================
   本を追加
   ========================================================= */
function openImportSheet() {
  const body = openSheet("本を追加", `
    <div class="import-drop" id="importDrop">
      <p class="import-emblem" aria-hidden="true">卷</p>
      <p><strong>ファイルを選ぶ</strong><br /><small>またはここへドラッグ</small></p>
      <p class="import-types">TXT ・ 青空文庫ZIP ・ EPUB ・ HTML ・ Markdown</p>
    </div>
    <details class="import-paste">
      <summary>文章を貼り付けて本にする</summary>
      <label class="field"><span>書名</span><input id="pasteTitle" type="text" placeholder="無題" /></label>
      <label class="field"><span>本文</span><textarea id="pasteText" rows="8" placeholder="ここに文章を貼り付け。｜漢字《かんじ》のルビ記法も使えます。"></textarea></label>
      <button id="pasteSave" class="btn btn-primary full">本棚に入れる</button>
    </details>
    <div class="import-help">
      <h4>青空文庫の本を読むには</h4>
      <ol>
        <li>青空文庫（aozora.gr.jp）で読みたい作品の「図書カード」を開く</li>
        <li>「ファイルのダウンロード」から <b>テキストファイル(ルビあり)</b> のZIPを保存</li>
        <li>そのZIPを、ここで選ぶだけ。ルビも傍点も見出しもそのまま。</li>
      </ol>
      <p class="muted">DRM（コピー防止）のかかった電子書籍は開けません。読み込んだファイルは端末の外へ送信されません。</p>
    </div>`);
  $("#importDrop", body).addEventListener("click", () => $("#fileInput").click());
  $("#pasteSave", body).addEventListener("click", async () => {
    const text = $("#pasteText", body).value;
    if (!text.trim()) { toast("本文が空です"); return; }
    const parsed = parsePasted(text, $("#pasteTitle", body).value.trim() || "無題");
    const r = await saveParsed(parsed, { allowDup: true });
    toast(`『${r.meta.title}』を本棚に入れました`);
    closeSheet();
    renderShelf();
  });
}

/* =========================================================
   本の詳細
   ========================================================= */
function openBookSheet(id) {
  const b = books.find((x) => x.id === id);
  if (!b) return;
  const pct = Math.round(bookPercent(b) * 100);
  const timeSpent = (stats.books[b.id] || 0) / 60;
  const body = openSheet("本の詳細", `
    <div class="detail">
      <div class="detail-cover">${coverHTML(b)}</div>
      <div class="detail-info">
        <label class="field"><span>書名</span><input id="dTitle" type="text" value="${esc(b.title)}" /></label>
        <label class="field"><span>著者</span><input id="dAuthor" type="text" value="${esc(b.author)}" /></label>
        <dl class="kv">
          <dt>形式</dt><dd>${{ aozora: "青空文庫形式", txt: "テキスト", epub: "EPUB", html: "HTML", md: "Markdown" }[b.format] || b.format}</dd>
          <dt>文字数</dt><dd>約${b.chars.toLocaleString()}字（${fmtMin(b.chars / stats.speed)}ほど）</dd>
          <dt>進み具合</dt><dd>${b.finished ? "読了" : `${pct}%`}</dd>
          <dt>読んだ時間</dt><dd>${fmtMin(timeSpent)}</dd>
          <dt>マーカー</dt><dd>${b.highlights.length}件 ・ 栞 ${b.bookmarks.length}件</dd>
          <dt>追加日</dt><dd>${fmtDate(b.added)}</dd>
        </dl>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="dRead">${pct > 0 && !b.finished ? "続きから読む" : "読む"}</button>
      <button class="btn btn-ghost" id="dRestart">はじめから</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost" id="dExport">メモを書き出す</button>
      <button class="btn btn-danger" id="dDelete">本棚から消す</button>
    </div>`, {
    onClose: async () => {
      const t = $("#dTitle")?.value.trim();
      const a = $("#dAuthor")?.value.trim();
      if (t && (t !== b.title || a !== b.author)) {
        b.title = t;
        b.author = a;
        await db.putBook(b);
        renderShelf();
      }
    },
  });
  $("#dRead", body).onclick = () => { closeSheet(); openBook(b.id); };
  $("#dRestart", body).onclick = async () => {
    b.pos = null; b.percent = 0; b.finished = false;
    await db.putBook(b);
    closeSheet();
    openBook(b.id);
  };
  $("#dExport", body).onclick = () => exportNotes([b]);
  $("#dDelete", body).onclick = async () => {
    if (!confirm(`『${b.title}』を本棚から消します。マーカーと栞も消えます。よろしいですか？`)) return;
    await db.deleteBook(b.id);
    books = books.filter((x) => x.id !== b.id);
    delete stats.books[b.id];
    saveStats();
    sheetOnClose = null;
    closeSheet();
    renderShelf();
    toast("本棚から消しました");
  };
}

/* =========================================================
   リーダー
   ========================================================= */
const R = {
  el: $("#reader"),
  book: null,
  content: null,
  chrome: false,
  lastTurnAt: 0,
  lastAct: Date.now(),
  pages: 1,
  page: 0,
};

const reader = createReader(
  { root: R.el, viewport: $("#rdViewport"), flow: $("#rdFlow"), dim: $("#rdDim") },
  {
    getHighlights: (sec) => (R.book ? R.book.highlights.filter((h) => h.sec === sec) : []),
    onChange: (info) => onReaderChange(info),
    onTurn: (dir) => onTurn(dir),
    onEnd: () => onBookEnd(),
  },
);

function prefix(sec) {
  let s = 0;
  for (let i = 0; i < sec; i++) s += R.book.secChars[i] || 0;
  return s;
}

function bookFraction(sec, ratio) {
  const total = R.book.chars || 1;
  return clamp((prefix(sec) + (R.book.secChars[sec] || 0) * ratio) / total, 0, 1);
}

function secTitle(sec) {
  const t = R.book.secTitles?.[sec] || R.content?.sections[sec]?.title || "";
  if (t) return t;
  for (let i = R.book.toc.length - 1; i >= 0; i--) if (R.book.toc[i].sec <= sec) return R.book.toc[i].title;
  return R.book.title;
}

const savePos = debounce(async () => {
  if (!R.book) return;
  const pos = reader.position();
  R.book.pos = pos;
  R.book.percent = bookFraction(pos.sec, pos.ratio);
  R.book.opened = Date.now();
  R.book.posLabel = `${secTitle(pos.sec)}　${reader.textBetween(pos.off, pos.off + 36).replace(/\s+/g, " ")}…`;
  await db.putBook(R.book);
}, 600);

function onReaderChange({ sec, page, pages, ratio, paged }) {
  if (!R.book) return;
  R.page = page;
  R.pages = pages;
  R.sec = sec;
  const frac = bookFraction(sec, paged ? (pages > 1 ? (page + 1) / pages : 1) : ratio);
  const pct = Math.floor(frac * 100);
  $("#rdRunTitle").textContent = secTitle(sec);
  $("#rdFootLeft").textContent = paged ? `${page + 1} / ${pages}` : `${Math.round(ratio * 100)}%`;
  $("#rdFootRight").textContent = `${pct}%`;
  $("#rdChapTitle").textContent = secTitle(sec);
  const secLeft = (R.book.secChars[sec] || 0) * (1 - (paged ? (pages > 1 ? (page + 1) / pages : 1) : ratio));
  const bookLeft = R.book.chars * (1 - frac);
  $("#rdSeekInfo").textContent = `${pct}% ・ この章の残り 約${fmtMin(secLeft / stats.speed)} ・ 本の残り 約${fmtMin(bookLeft / stats.speed)}`;
  if (!R.sliding) $("#rdSlider").value = Math.round(frac * 1000);
  updateMarkBtn();
  savePos();
}

function onTurn(dir) {
  if (dir <= 0 || !R.book) return;
  const now = Date.now();
  const cpp = (R.book.secChars[R.sec] || 0) / Math.max(1, R.pages);
  if (reader.st.paged) {
    dayRec().chars += Math.round(cpp);
    const dt = now - R.lastTurnAt;
    if (dt > 3000 && dt < 5 * 60000 && cpp > 20) {
      const inst = cpp / (dt / 60000);
      stats.speed = clamp(Math.round(stats.speed * 0.92 + inst * 0.08), 150, 2000);
    }
  }
  R.lastTurnAt = now;
  saveStats();
}

async function onBookEnd() {
  if (!R.book) return;
  if (R.book.finished) { toast("最後のページです"); return; }
  R.book.finished = true;
  R.book.finishedAt = Date.now();
  R.book.percent = 1;
  stats.finished = (stats.finished || 0) + 1;
  saveStats();
  await db.putBook(R.book);
  stopTts();
  stopAuto();
  const spent = (stats.books[R.book.id] || 0) / 60;
  const body = openSheet("読了", `
    <div class="finish">
      <p class="finish-emblem" aria-hidden="true">❀</p>
      <h4>『${esc(R.book.title)}』を読み終えました</h4>
      <p>読んだ時間 ${fmtMin(spent)} ・ マーカー ${R.book.highlights.length}件</p>
      <p class="muted">これまでに読み終えた本：${stats.finished}冊</p>
      <div class="btn-row"><button class="btn btn-primary" id="finShelf">本棚へ戻る</button><button class="btn btn-ghost" id="finStay">このまま読む</button></div>
    </div>`);
  petalBurst(document.body, 40);
  $("#finShelf", body).onclick = () => { closeSheet(); closeReader(); };
  $("#finStay", body).onclick = () => closeSheet();
}

async function openBook(id) {
  const meta = books.find((b) => b.id === id) || (await db.getBook(id));
  const content = await db.getContent(id);
  if (!meta || !content) { toast("本が見つかりませんでした"); return; }
  R.book = meta;
  R.content = content;
  R.el.hidden = false;
  document.body.classList.add("reading");
  setChrome(false);
  $("#rdBookTitle").textContent = meta.title;
  history.pushState({ reader: id }, "");
  meta.opened = Date.now();
  await reader.open(meta, content, meta.pos, settings);
  requestWake();
  R.lastAct = Date.now();
  if (!localStorage.getItem("hb.tapHint")) {
    localStorage.setItem("hb.tapHint", "1");
    showTapHint();
  }
}

function showTapHint() {
  const h = $("#rdTurnHint");
  const v = reader.st.vertical;
  h.innerHTML = `<div class="zone ${v ? "next" : "prev"}">${v ? "次へ" : "前へ"}</div><div class="zone menu">メニュー</div><div class="zone ${v ? "prev" : "next"}">${v ? "前へ" : "次へ"}</div>`;
  h.classList.add("show");
  setTimeout(() => h.classList.remove("show"), 2600);
}

function closeReader(fromPop = false) {
  if (R.el.hidden) return;
  if (!fromPop && history.state?.reader) { history.back(); return; }
  stopTts();
  stopAuto();
  hideSelPop();
  closeSheet();
  savePos();
  R.el.hidden = true;
  document.body.classList.remove("reading");
  releaseWake();
  R.book = null;
  R.content = null;
  $("#rdFlow").innerHTML = "";
  renderShelf();
}

function setChrome(on) {
  R.chrome = on;
  R.el.classList.toggle("chrome-on", on);
  if (!on) hideSelPop();
}

/* ---- 入力（タップ・スワイプ・キー・ホイール） ---- */
const stage = $("#rdStage");
let touch = null;
let swallowClick = false;

stage.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  touch = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
});
stage.addEventListener("pointerup", (e) => {
  if (!touch || touch.id !== e.pointerId) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  const dt = Date.now() - touch.t;
  touch = null;
  R.lastAct = Date.now();
  if (!reader.st.paged) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 800) {
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 400);
    // 縦書き：右へスワイプで次へ。横書き：左へスワイプで次へ
    const forward = reader.st.vertical ? dx > 0 : dx < 0;
    if (R.chrome) setChrome(false);
    forward ? reader.next() : reader.prev();
  }
});
stage.addEventListener("click", (e) => {
  R.lastAct = Date.now();
  if (swallowClick) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return;
  const nextBtn = e.target.closest(".next-sec-btn");
  if (nextBtn) { reader.render(reader.st.sec + 1, { page: 0 }, "next"); return; }
  const mark = e.target.closest("mark.hl");
  if (mark && !R.chrome) { openHighlightSheet(mark.dataset.id); return; }
  if (R.chrome) { setChrome(false); return; }
  if (!$("#selPop").hidden) { hideSelPop(); return; }
  const w = stage.clientWidth;
  const x = e.clientX - stage.getBoundingClientRect().left;
  const zone = x < w * 0.32 ? "left" : x > w * 0.68 ? "right" : "center";
  if (zone === "center") { setChrome(true); return; }
  if (settings.tap === "next") { reader.next(); return; }
  const forward = reader.st.vertical ? zone === "left" : zone === "right";
  forward ? reader.next() : reader.prev();
});

let wheelAcc = 0;
let wheelLock = 0;
stage.addEventListener("wheel", (e) => {
  R.lastAct = Date.now();
  if (!reader.st.paged) {
    if (reader.st.vertical && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      $("#rdViewport").scrollLeft -= e.deltaY;
    }
    return;
  }
  e.preventDefault();
  const now = Date.now();
  if (now < wheelLock) return;
  wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : (reader.st.vertical ? -e.deltaX : e.deltaX);
  if (Math.abs(wheelAcc) > 40) {
    wheelAcc > 0 ? reader.next() : reader.prev();
    wheelAcc = 0;
    wheelLock = now + 320;
  }
}, { passive: false });

$("#rdViewport").addEventListener("scroll", debounce(() => { if (!reader.st.paged && R.book) reader.emit(); }, 120), { passive: true });

document.addEventListener("keydown", (e) => {
  if (R.el.hidden) return;
  if (e.target.closest("input, textarea, select")) return;
  if (e.key === "Escape") {
    if (sheetOpen()) closeSheet();
    else if (R.chrome) setChrome(false);
    else closeReader();
    return;
  }
  if (sheetOpen()) return;
  R.lastAct = Date.now();
  const v = reader.st.vertical;
  const nextKeys = [" ", "PageDown", "ArrowDown", v ? "ArrowLeft" : "ArrowRight"];
  const prevKeys = ["PageUp", "ArrowUp", v ? "ArrowRight" : "ArrowLeft"];
  if (e.key === " " && e.shiftKey) { e.preventDefault(); reader.prev(); return; }
  if (nextKeys.includes(e.key)) { e.preventDefault(); reader.next(); }
  else if (prevKeys.includes(e.key)) { e.preventDefault(); reader.prev(); }
  else if (e.key === "m" || e.key === "Enter") setChrome(!R.chrome);
  else if (e.key === "f" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearchSheet(); }
});

window.addEventListener("resize", debounce(() => { if (R.book) reader.relayout(); }, 180));
document.fonts?.addEventListener?.("loadingdone", debounce(() => { if (R.book) reader.relayout(); }, 250));

/* ---- 上下のバー ---- */
$("#rdBack").onclick = () => closeReader();
$("#rdTocBtn").onclick = () => openTocSheet("toc");
$("#rdAaBtn").onclick = () => openAaSheet();
$("#rdSearchBtn").onclick = () => openSearchSheet();
$("#rdMarkBtn").onclick = () => toggleBookmark();
$("#rdTtsBtn").onclick = () => { setChrome(false); startTts(); };
$("#rdAutoBtn").onclick = () => { setChrome(false); startAuto(); };
$("#rdPrevChap").onclick = () => { if (reader.st.sec > 0) reader.goTo({ sec: reader.st.sec - 1, page: 0 }, "prev"); };
$("#rdNextChap").onclick = () => { if (reader.st.sec < R.content.sections.length - 1) reader.goTo({ sec: reader.st.sec + 1, page: 0 }, "next"); };

const slider = $("#rdSlider");
slider.addEventListener("input", () => {
  R.sliding = true;
  const frac = slider.value / 1000;
  const { sec } = fracToPos(frac);
  $("#rdSeekInfo").textContent = `${Math.round(frac * 100)}% ・ ${secTitle(sec)}`;
});
slider.addEventListener("change", async () => {
  const frac = slider.value / 1000;
  const { sec, ratio } = fracToPos(frac);
  await reader.goTo({ sec, ratio });
  R.sliding = false;
  reader.emit();
});
function fracToPos(frac) {
  const target = frac * R.book.chars;
  let acc = 0;
  for (let i = 0; i < R.book.secChars.length; i++) {
    const c = R.book.secChars[i];
    if (acc + c >= target || i === R.book.secChars.length - 1) return { sec: i, ratio: c ? clamp((target - acc) / c, 0, 1) : 0 };
    acc += c;
  }
  return { sec: 0, ratio: 0 };
}

/* ---- 栞 ---- */
function bookmarkOnPage() {
  if (!R.book) return null;
  return R.book.bookmarks.find((m) => m.sec === reader.st.sec && reader.isOffsetOnPage(m.off)) || null;
}
function updateMarkBtn() {
  const on = !!bookmarkOnPage();
  $("#rdMarkBtn").classList.toggle("active", on);
  R.el.classList.toggle("bookmarked", on);
}
async function toggleBookmark() {
  const cur = bookmarkOnPage();
  if (cur) {
    R.book.bookmarks = R.book.bookmarks.filter((m) => m !== cur);
    toast("栞をはずしました");
  } else {
    const pos = reader.position();
    R.book.bookmarks.push({
      id: uid(), sec: pos.sec, off: pos.off, at: Date.now(),
      label: reader.textBetween(pos.off, pos.off + 48).replace(/\s+/g, " "),
      pct: bookFraction(pos.sec, pos.ratio),
    });
    toast("栞をはさみました");
  }
  await db.putBook(R.book);
  updateMarkBtn();
}

/* ---- 目次・栞・メモ ---- */
function openTocSheet(tab = "toc") {
  const b = R.book;
  const cur = reader.st.sec;
  const tocHTML = b.toc.map((t, i) => {
    const active = t.sec === cur && (b.toc[i + 1]?.sec !== cur || !t.anchor) ? " current" : "";
    const pct = Math.round((prefix(t.sec) / (b.chars || 1)) * 100);
    return `<li><button class="toc-item lv${t.level}${active}" data-sec="${t.sec}" data-anchor="${esc(t.anchor || "")}"><span>${esc(t.title)}</span><small>${pct}%</small></button></li>`;
  }).join("");
  const bmHTML = b.bookmarks.length
    ? [...b.bookmarks].sort((x, y) => x.sec - y.sec || x.off - y.off).map((m) => `<li class="mark-row"><button class="toc-item" data-sec="${m.sec}" data-off="${m.off}"><span>🔖 ${esc(m.label)}…</span><small>${esc(secTitle(m.sec))} ・ ${Math.round((m.pct || 0) * 100)}%</small></button><button class="del-btn" data-delbm="${m.id}" aria-label="栞を消す">✕</button></li>`).join("")
    : '<li class="empty-row">栞はまだありません。読んでいるページで上の🔖を押すと、はさめます。</li>';
  const hlHTML = b.highlights.length
    ? [...b.highlights].sort((x, y) => x.sec - y.sec || x.start - y.start).map((h) => `<li><button class="toc-item hl-item" data-sec="${h.sec}" data-off="${h.start}" data-len="${h.end - h.start}"><span class="hl-quote c${h.color}">${esc(h.text.slice(0, 120))}</span>${h.note ? `<span class="hl-note">✎ ${esc(h.note)}</span>` : ""}<small>${esc(secTitle(h.sec))}</small></button></li>`).join("")
    : '<li class="empty-row">マーカーはまだありません。本文を長押しして文字を選ぶと引けます。</li>';
  const body = openSheet(b.title, `
    <div class="tabs" role="tablist">
      <button class="tab ${tab === "toc" ? "active" : ""}" data-tab="toc">目次</button>
      <button class="tab ${tab === "bm" ? "active" : ""}" data-tab="bm">栞 ${b.bookmarks.length || ""}</button>
      <button class="tab ${tab === "hl" ? "active" : ""}" data-tab="hl">メモ ${b.highlights.length || ""}</button>
    </div>
    <ul class="toc-list" data-pane="toc" ${tab !== "toc" ? "hidden" : ""}>${tocHTML}</ul>
    <ul class="toc-list" data-pane="bm" ${tab !== "bm" ? "hidden" : ""}>${bmHTML}</ul>
    <ul class="toc-list" data-pane="hl" ${tab !== "hl" ? "hidden" : ""}>${hlHTML}</ul>`, { cls: "toc-sheet" });
  for (const t of $$(".tab", body)) t.onclick = () => {
    for (const x of $$(".tab", body)) x.classList.toggle("active", x === t);
    for (const p of $$("[data-pane]", body)) p.hidden = p.dataset.pane !== t.dataset.tab;
  };
  body.onclick = async (e) => {
    const del = e.target.closest("[data-delbm]");
    if (del) {
      R.book.bookmarks = R.book.bookmarks.filter((m) => m.id !== del.dataset.delbm);
      await db.putBook(R.book);
      del.closest("li").remove();
      updateMarkBtn();
      return;
    }
    const it = e.target.closest(".toc-item");
    if (!it) return;
    closeSheet();
    setChrome(false);
    const sec = +it.dataset.sec;
    if (it.dataset.off) {
      const off = +it.dataset.off;
      await reader.goTo({ sec, off });
      if (it.dataset.len) reader.flash(off, off + +it.dataset.len);
    } else {
      await reader.goTo(it.dataset.anchor ? { sec, anchor: it.dataset.anchor } : { sec, page: 0 });
    }
  };
  const curEl = $(".toc-item.current", body);
  if (curEl && tab === "toc") setTimeout(() => curEl.scrollIntoView({ block: "center" }), 60);
}

/* ---- 表示の設定 ---- */
const THEMES = [
  { id: "urushi", label: "漆" },
  { id: "kin", label: "金屏風" },
  { id: "kinari", label: "生成り" },
  { id: "sakura", label: "桜" },
  { id: "fuji", label: "藤" },
  { id: "yozakura", label: "夜桜" },
  { id: "sumi", label: "墨" },
];
const applyLive = debounce(() => reader.applySettings(settings), 140);
function setSetting(k, v, live = true) {
  settings[k] = v;
  saveSettings();
  if (live && R.book) applyLive();
}

function openAaSheet() {
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(settings[key]) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const body = openSheet("表示", `
    <div class="aa">
      <div class="aa-row"><span class="aa-label">文字の向き</span>${seg("mode", [["auto", "本に合わせる"], ["v", "縦書き"], ["h", "横書き"]])}</div>
      <div class="aa-row"><span class="aa-label">めくり方</span>${seg("flow", [["page", "ページ"], ["scroll", "スクロール"]])}</div>
      <div class="aa-row col"><span class="aa-label">色</span>
        <div class="themes">${THEMES.map((t) => `<button class="theme-swatch sw-${t.id} ${settings.theme === t.id ? "on" : ""}" data-theme="${t.id}"><span>あ</span><small>${t.label}</small></button>`).join("")}</div>
      </div>
      <div class="aa-row"><span class="aa-label">明るさ</span><input type="range" min="0.3" max="1" step="0.05" value="${settings.bright}" data-range="bright" /></div>
      <div class="aa-row col"><span class="aa-label">書体</span>
        <div class="fonts">${Object.entries(FONTS).map(([k, f]) => `<button class="font-btn ${settings.font === k ? "on" : ""}" data-font="${k}" style="font-family:${esc(f.css)}">${f.label}<small>永い春の夜</small></button>`).join("")}</div>
      </div>
      <div class="aa-row"><span class="aa-label">文字の大きさ</span>
        <div class="stepper"><button data-step="size" data-d="-1" aria-label="小さく">Ａ－</button><output id="aaSize">${settings.size}</output><button data-step="size" data-d="1" aria-label="大きく">Ａ＋</button></div>
      </div>
      <div class="aa-row"><span class="aa-label">行間</span><input type="range" min="1.4" max="2.6" step="0.05" value="${settings.lh}" data-range="lh" /></div>
      <div class="aa-row"><span class="aa-label">字間</span><input type="range" min="0" max="0.16" step="0.01" value="${settings.ls}" data-range="ls" /></div>
      <div class="aa-row"><span class="aa-label">余白</span>${seg("margin", [[12, "狭い"], [26, "ふつう"], [48, "広い"]])}</div>
      <div class="aa-row"><span class="aa-label">めくり効果</span>${seg("anim", [["slide", "すべる"], ["fade", "ふわり"], ["none", "なし"]])}</div>
      <div class="aa-row"><span class="aa-label">タップ</span>${seg("tap", [["std", "左右で前後"], ["next", "どこでも次へ"]])}</div>
      <div class="aa-row"><span class="aa-label">自動めくり</span>${seg("autoSec", [[10, "10秒"], [20, "20秒"], [40, "40秒"], [60, "60秒"]])}</div>
      <label class="aa-row toggle"><span class="aa-label">両端をそろえる</span><input type="checkbox" data-check="justify" ${settings.justify ? "checked" : ""} /></label>
      <label class="aa-row toggle"><span class="aa-label">文字を太く</span><input type="checkbox" data-check="bold" ${settings.bold ? "checked" : ""} /></label>
      <label class="aa-row toggle"><span class="aa-label">見開き（横書き・広い画面）</span><input type="checkbox" data-check="spread" ${settings.spread ? "checked" : ""} /></label>
      <label class="aa-row toggle"><span class="aa-label">読書中は画面を消さない</span><input type="checkbox" data-check="wake" ${settings.wake ? "checked" : ""} /></label>
      <button class="btn btn-ghost full" id="aaReset">表示を最初の状態に戻す</button>
    </div>`, { cls: "aa-sheet" });

  body.onclick = (e) => {
    const sb = e.target.closest(".seg button");
    if (sb) {
      const key = sb.parentElement.dataset.key;
      const raw = sb.dataset.v;
      const v = ["margin", "autoSec"].includes(key) ? +raw : raw;
      for (const b of sb.parentElement.children) b.classList.toggle("on", b === sb);
      setSetting(key, v, !["autoSec", "tap"].includes(key));
      if (key === "autoSec") updateAutoBar();
      return;
    }
    const th = e.target.closest("[data-theme]");
    if (th) {
      for (const b of $$("[data-theme]", body)) b.classList.toggle("on", b === th);
      setSetting("theme", th.dataset.theme, false);
      reader.applySettings(settings);
      return;
    }
    const fb = e.target.closest("[data-font]");
    if (fb) {
      for (const b of $$("[data-font]", body)) b.classList.toggle("on", b === fb);
      setSetting("font", fb.dataset.font);
      return;
    }
    const stp = e.target.closest("[data-step]");
    if (stp) {
      settings.size = clamp(settings.size + +stp.dataset.d, 12, 44);
      $("#aaSize").textContent = settings.size;
      setSetting("size", settings.size);
    }
  };
  for (const r of $$("[data-range]", body)) r.oninput = () => {
    if (r.dataset.range === "bright") {
      setSetting("bright", +r.value, false);
      $("#rdDim").style.opacity = String(Math.max(0, 1 - settings.bright) * 0.85);
    } else setSetting(r.dataset.range, +r.value);
  };
  for (const c of $$("[data-check]", body)) c.onchange = () => {
    setSetting(c.dataset.check, c.checked, !["wake"].includes(c.dataset.check));
    if (c.dataset.check === "wake") (c.checked ? requestWake() : releaseWake());
  };
  $("#aaReset", body).onclick = () => {
    const keep = { ttsRate: settings.ttsRate };
    Object.assign(settings, DEFAULTS, keep);
    saveSettings();
    reader.applySettings(settings);
    closeSheet();
    toast("表示を最初の状態に戻しました");
  };
}

/* ---- 本の中を検索 ---- */
const textCache = new Map();
function sectionText(sec) {
  const key = `${R.book.id}:${sec}`;
  if (textCache.has(key)) return textCache.get(key);
  const tpl = document.createElement("template");
  tpl.innerHTML = R.content.sections[sec].html;
  let out = "";
  const w = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    let skip = false;
    for (let p = n.parentNode; p && p !== tpl.content; p = p.parentNode) if (p.localName === "rt" || p.localName === "rp") { skip = true; break; }
    if (!skip) out += n.nodeValue;
  }
  textCache.set(key, out);
  return out;
}

let lastQuery = "";
function openSearchSheet() {
  const body = openSheet("本の中を検索", `
    <label class="search-box big"><span aria-hidden="true">🔍</span><input id="bookQuery" type="search" placeholder="言葉を入れてください" value="${esc(lastQuery)}" enterkeyhint="search" /></label>
    <p id="searchCount" class="muted"></p>
    <ul id="searchResults" class="search-results"></ul>`);
  const input = $("#bookQuery", body);
  const run = () => {
    const q = input.value.trim();
    lastQuery = q;
    const out = $("#searchResults", body);
    if (!q) { out.innerHTML = ""; $("#searchCount", body).textContent = ""; return; }
    const ql = q.toLowerCase();
    const results = [];
    for (let s = 0; s < R.content.sections.length && results.length < 500; s++) {
      const t = sectionText(s);
      const tl = t.toLowerCase();
      let i = tl.indexOf(ql);
      while (i >= 0 && results.length < 500) {
        results.push({ sec: s, off: i, snip: [t.slice(Math.max(0, i - 24), i), t.slice(i, i + q.length), t.slice(i + q.length, i + q.length + 30)] });
        i = tl.indexOf(ql, i + q.length);
      }
    }
    $("#searchCount", body).textContent = results.length ? `${results.length >= 500 ? "500件以上" : `${results.length}件`}見つかりました` : "見つかりませんでした";
    out.innerHTML = results.map((r) => `<li><button class="toc-item" data-sec="${r.sec}" data-off="${r.off}" data-len="${q.length}"><span>…${esc(r.snip[0])}<mark>${esc(r.snip[1])}</mark>${esc(r.snip[2])}…</span><small>${esc(secTitle(r.sec))}</small></button></li>`).join("");
  };
  input.addEventListener("input", debounce(run, 220));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  body.onclick = async (e) => {
    const it = e.target.closest(".toc-item");
    if (!it) return;
    closeSheet();
    setChrome(false);
    const off = +it.dataset.off;
    await reader.goTo({ sec: +it.dataset.sec, off });
    reader.flash(off, off + +it.dataset.len);
  };
  run();
  setTimeout(() => input.focus(), 250);
}

/* ---- 文字の選択とマーカー ---- */
const selPop = $("#selPop");
let selInfo = null;
function hideSelPop() { selPop.hidden = true; selInfo = null; }

document.addEventListener("selectionchange", debounce(() => {
  if (R.el.hidden || sheetOpen()) return;
  const info = reader.selectionOffsets();
  if (!info || !info.text.trim()) { hideSelPop(); return; }
  selInfo = info;
  selPop.hidden = false;
  const pr = R.el.getBoundingClientRect();
  const pw = selPop.offsetWidth;
  const ph = selPop.offsetHeight;
  let x = info.rect.left + info.rect.width / 2 - pw / 2;
  let y = info.rect.top - ph - 14;
  if (y < pr.top + 60) y = info.rect.bottom + 14;
  if (y + ph > pr.bottom - 10) y = pr.top + 70;
  x = clamp(x, 8, pr.width - pw - 8);
  selPop.style.left = `${x}px`;
  selPop.style.top = `${y}px`;
}, 260));

selPop.addEventListener("pointerdown", (e) => e.preventDefault());
selPop.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn || !selInfo) return;
  const info = selInfo;
  if (btn.dataset.color) {
    await addHighlight(info, +btn.dataset.color);
  } else if (btn.dataset.act === "note") {
    const h = await addHighlight(info, 1);
    openHighlightSheet(h.id, true);
  } else if (btn.dataset.act === "copy") {
    try { await navigator.clipboard.writeText(info.text); toast("コピーしました"); } catch { toast("コピーできませんでした"); }
  } else if (btn.dataset.act === "dict") {
    window.open(`https://www.weblio.jp/content/${encodeURIComponent(info.text.trim().slice(0, 40))}`, "_blank", "noopener");
  } else if (btn.dataset.act === "speak") {
    startTts(info.start);
  }
  window.getSelection()?.removeAllRanges();
  hideSelPop();
});

async function addHighlight(info, color) {
  const sec = reader.st.sec;
  // 重なる既存のマーカーは統合する
  const overlapping = R.book.highlights.filter((h) => h.sec === sec && h.start < info.end && h.end > info.start);
  let start = info.start;
  let end = info.end;
  let note = "";
  for (const o of overlapping) { start = Math.min(start, o.start); end = Math.max(end, o.end); if (o.note) note = note ? `${note}\n${o.note}` : o.note; }
  R.book.highlights = R.book.highlights.filter((h) => !overlapping.includes(h));
  const h = { id: uid(), sec, start, end, text: reader.textBetween(start, end), color, note, at: Date.now() };
  R.book.highlights.push(h);
  await db.putBook(R.book);
  reader.paintHighlights();
  return h;
}

function openHighlightSheet(id, focusNote = false) {
  const h = R.book?.highlights.find((x) => x.id === id);
  if (!h) return;
  const body = openSheet("マーカー", `
    <blockquote class="hl-quote big c${h.color}">${esc(h.text)}</blockquote>
    <div class="hl-colors">${[1, 2, 3, 4].map((c) => `<button class="hl-dot c${c} ${h.color === c ? "on" : ""}" data-c="${c}" aria-label="色${c}"></button>`).join("")}</div>
    <label class="field"><span>メモ</span><textarea id="hlNote" rows="4" placeholder="思ったこと、気づいたこと">${esc(h.note || "")}</textarea></label>
    <div class="btn-row">
      <button class="btn btn-ghost" id="hlCopy">コピー</button>
      <button class="btn btn-danger" id="hlDel">マーカーを消す</button>
    </div>`, {
    onClose: async () => {
      const v = $("#hlNote")?.value ?? h.note;
      if (R.book && R.book.highlights.includes(h) && v !== h.note) {
        h.note = v;
        await db.putBook(R.book);
        reader.paintHighlights();
      }
    },
  });
  body.onclick = async (e) => {
    const c = e.target.closest("[data-c]");
    if (c) {
      h.color = +c.dataset.c;
      for (const b of $$("[data-c]", body)) b.classList.toggle("on", b === c);
      $(".hl-quote", body).className = `hl-quote big c${h.color}`;
      await db.putBook(R.book);
      reader.paintHighlights();
    }
  };
  $("#hlCopy", body).onclick = async () => { try { await navigator.clipboard.writeText(h.text); toast("コピーしました"); } catch { /* noop */ } };
  $("#hlDel", body).onclick = async () => {
    R.book.highlights = R.book.highlights.filter((x) => x !== h);
    await db.putBook(R.book);
    reader.paintHighlights();
    sheetOnClose = null;
    closeSheet();
    toast("マーカーを消しました");
  };
  if (focusNote) setTimeout(() => $("#hlNote", body)?.focus(), 260);
}

/* ---- 音読 ---- */
const tts = { on: false, paused: false, chunks: [], i: 0, voice: null };
function pickVoice() {
  const lang = R.book?.lang === "en" ? "en" : "ja";
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
  return voices.find((v) => /Kyoko|O-ren|Nanami|Google 日本語|Haruka|Ayumi/.test(v.name)) || voices[0] || null;
}
function updateTtsBar() {
  $("#ttsBar").hidden = !tts.on;
  $("#ttsPlay").textContent = tts.paused ? "▶" : "⏸";
  $("#ttsPlay").setAttribute("aria-label", tts.paused ? "再開" : "一時停止");
  $("#ttsRate").textContent = `${settings.ttsRate.toFixed(1)}×`;
  $("#ttsInfo").textContent = R.book ? secTitle(reader.st.sec) : "";
  R.el.classList.toggle("tts-on", tts.on || auto.on);
}
function startTts(fromOff) {
  if (!("speechSynthesis" in window)) { toast("この端末では音読が使えません"); return; }
  stopAuto();
  speechSynthesis.cancel();
  const off = typeof fromOff === "number" ? fromOff : reader.position().off;
  tts.on = true;
  tts.paused = false;
  tts.chunks = reader.speechChunks(off);
  tts.i = 0;
  tts.voice = pickVoice();
  updateTtsBar();
  requestWake();
  speakNext();
}
async function speakNext() {
  if (!tts.on || tts.paused) return;
  if (tts.i >= tts.chunks.length) {
    if (reader.st.sec < R.content.sections.length - 1) {
      await reader.render(reader.st.sec + 1, { page: 0 }, "next");
      tts.chunks = reader.speechChunks(0);
      tts.i = 0;
      updateTtsBar();
      if (!tts.chunks.length) { stopTts(); return; }
    } else { stopTts(); onBookEnd(); return; }
  }
  const c = tts.chunks[tts.i];
  reader.ensureVisible(c.start);
  reader.setHighlight("tts", c.start, c.end);
  const u = new SpeechSynthesisUtterance(c.text);
  u.lang = R.book?.lang === "en" ? "en-US" : "ja-JP";
  if (tts.voice) u.voice = tts.voice;
  u.rate = settings.ttsRate;
  const myIndex = tts.i;
  u.onend = () => {
    if (!tts.on || tts.paused || tts.i !== myIndex) return;
    tts.i++;
    R.lastAct = Date.now();
    speakNext();
  };
  u.onerror = (e) => {
    if (e.error === "interrupted" || e.error === "canceled") return;
    if (tts.i === myIndex) { tts.i++; setTimeout(speakNext, 50); }
  };
  speechSynthesis.speak(u);
}
function stopTts() {
  if (!tts.on) return;
  tts.on = false;
  tts.paused = false;
  try { speechSynthesis.cancel(); } catch { /* noop */ }
  reader.setHighlight("tts", null);
  updateTtsBar();
  if (!settings.wake) releaseWake();
}
$("#ttsPlay").onclick = () => {
  if (!tts.on) return;
  if (tts.paused) { tts.paused = false; updateTtsBar(); speakNext(); }
  else { tts.paused = true; speechSynthesis.cancel(); updateTtsBar(); }
};
$("#ttsStop").onclick = () => stopTts();
const changeRate = (d) => {
  settings.ttsRate = clamp(Math.round((settings.ttsRate + d) * 10) / 10, 0.5, 2.5);
  saveSettings();
  updateTtsBar();
  if (tts.on && !tts.paused) { speechSynthesis.cancel(); setTimeout(speakNext, 60); }
};
$("#ttsSlower").onclick = () => changeRate(-0.1);
$("#ttsFaster").onclick = () => changeRate(0.1);

/* ---- 自動ページめくり ---- */
const auto = { on: false, timer: null, left: 0 };
function updateAutoBar() {
  $("#autoBar").hidden = !auto.on;
  $("#autoSec").textContent = `${settings.autoSec}秒`;
  R.el.classList.toggle("tts-on", tts.on || auto.on);
}
function startAuto() {
  stopTts();
  auto.on = true;
  auto.left = settings.autoSec;
  clearInterval(auto.timer);
  auto.timer = setInterval(async () => {
    if (sheetOpen()) return;
    auto.left--;
    $("#autoInfo").textContent = `次のページまで ${auto.left}秒`;
    if (auto.left <= 0) {
      auto.left = settings.autoSec;
      R.lastAct = Date.now();
      const ok = await reader.next();
      if (!ok) stopAuto();
    }
  }, 1000);
  $("#autoInfo").textContent = `次のページまで ${auto.left}秒`;
  updateAutoBar();
  requestWake();
}
function stopAuto() {
  if (!auto.on) return;
  auto.on = false;
  clearInterval(auto.timer);
  updateAutoBar();
}
$("#autoStop").onclick = () => stopAuto();
$("#autoSlower").onclick = () => { settings.autoSec = clamp(settings.autoSec + 5, 5, 180); saveSettings(); auto.left = settings.autoSec; updateAutoBar(); };
$("#autoFaster").onclick = () => { settings.autoSec = clamp(settings.autoSec - 5, 5, 180); saveSettings(); auto.left = Math.min(auto.left, settings.autoSec); updateAutoBar(); };

/* ---- 画面を消さない ---- */
let wakeLock = null;
async function requestWake() {
  if (!settings.wake && !tts.on && !auto.on) return;
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch { /* 対応していない端末 */ }
}
function releaseWake() {
  try { wakeLock?.release(); } catch { /* noop */ }
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && R.book) requestWake();
  if (document.visibilityState === "hidden" && R.book) savePos();
});

/* ---- 読書時間の記録 ---- */
setInterval(() => {
  if (!R.book || R.el.hidden || document.visibilityState !== "visible") return;
  const active = Date.now() - R.lastAct < 3 * 60000 || tts.on || auto.on;
  if (!active) return;
  const before = dayRec().sec;
  dayRec().sec += 5;
  stats.books[R.book.id] = (stats.books[R.book.id] || 0) + 5;
  saveStats();
  const goal = stats.goal * 60;
  if (before < goal && dayRec().sec >= goal) {
    toast(`❀ きょうの目標 ${stats.goal}分 を達成しました`, 3500);
    petalBurst(document.body, 24);
  }
}, 5000);

/* =========================================================
   記録の画面
   ========================================================= */
function streakDays() {
  let n = 0;
  const d = new Date();
  if (!(stats.days[todayKey(d)]?.sec >= 60)) d.setDate(d.getDate() - 1);
  while (stats.days[todayKey(d)]?.sec >= 60) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderStats() {
  const today = dayRec();
  const min = today.sec / 60;
  const goal = stats.goal;
  const frac = clamp(min / goal, 0, 1);
  const totalSec = Object.values(stats.days).reduce((a, d) => a + d.sec, 0);
  const totalChars = Object.values(stats.days).reduce((a, d) => a + (d.chars || 0), 0);
  const hlCount = books.reduce((a, b) => a + b.highlights.length, 0);
  const finished = books.filter((b) => b.finished).length;

  // 桜の輪：目標までの割合で花びらが開く
  const petals = Math.round(frac * 5);
  const ring = `
    <svg viewBox="0 0 120 120" class="ring" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="none" stroke="#221d16" stroke-width="5"/>
      <defs><linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5e2a4"/><stop offset=".5" stop-color="#c9a55a"/><stop offset="1" stop-color="#8a6a2c"/></linearGradient></defs><circle cx="60" cy="60" r="52" fill="none" stroke="url(#ringG)" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${(2 * Math.PI * 52 * frac).toFixed(1)} 999" transform="rotate(-90 60 60)"/>
      <g transform="translate(60,60)">
        ${[0, 72, 144, 216, 288].map((r, i) => `<path d="M0,0 C-7,-5 -10,-15 -6,-22 L0,-18.5 L6,-22 C10,-15 7,-5 0,0Z" transform="rotate(${r}) scale(1.15)" fill="${i < petals ? "url(#ringG)" : "none"}" stroke="${i < petals ? "#f0d995" : "#3a3124"}" stroke-width="1"/>`).join("")}
        <circle r="4" fill="${petals >= 5 ? "#0b0907" : "#3a3124"}" stroke="${petals >= 5 ? "#f0d995" : "none"}"/>
      </g>
    </svg>`;

  // この7日
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ label: "日月火水木金土"[d.getDay()], min: (stats.days[todayKey(d)]?.sec || 0) / 60, today: i === 0 });
  }
  const maxMin = Math.max(goal, ...days.map((d) => d.min));
  const bars = days.map((d) => `<div class="bar ${d.today ? "today" : ""}"><div class="bar-fill" style="height:${(d.min / maxMin) * 100}%"></div><small>${d.label}</small></div>`).join("");

  // 花暦（18週）
  const weeks = 18;
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
  let cells = "";
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day > new Date()) { cells += '<span class="cell future"></span>'; continue; }
      const m = (stats.days[todayKey(day)]?.sec || 0) / 60;
      const lv = m <= 0 ? 0 : m < 5 ? 1 : m < 15 ? 2 : m < 30 ? 3 : 4;
      cells += `<span class="cell lv${lv}" title="${day.getMonth() + 1}/${day.getDate()} ${Math.round(m)}分"></span>`;
    }
  }

  const byBook = Object.entries(stats.books)
    .map(([id, sec]) => ({ b: books.find((x) => x.id === id), sec }))
    .filter((x) => x.b)
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 5);

  $("#statsBody").innerHTML = `
    <section class="card today-card">
      ${ring}
      <div>
        <small>きょう読んだ時間</small>
        <p class="big-num">${fmtMin(min)}</p>
        <p class="muted">目標 ${goal}分 ・ ${frac >= 1 ? "達成 ❀" : `あと${fmtMin(goal - min)}`}</p>
        <label class="goal-pick">一日の目標
          <select id="goalSel" class="select">${[5, 10, 15, 20, 30, 45, 60, 90].map((g) => `<option value="${g}" ${g === goal ? "selected" : ""}>${g}分</option>`).join("")}</select>
        </label>
      </div>
    </section>
    <div class="stat-grid">
      <div class="card stat"><small>続けて読んだ日</small><strong>${streakDays()}<span>日</span></strong></div>
      <div class="card stat"><small>読み終えた本</small><strong>${finished}<span>冊</span></strong></div>
      <div class="card stat"><small>これまでの読書時間</small><strong>${fmtMin(totalSec / 60)}</strong></div>
      <div class="card stat"><small>めくった文字</small><strong>${totalChars.toLocaleString()}<span>字</span></strong><em>原稿用紙 約${Math.round(totalChars / 400).toLocaleString()}枚</em></div>
      <div class="card stat"><small>あなたの読む速さ</small><strong>${stats.speed}<span>字/分</span></strong></div>
      <div class="card stat"><small>マーカー</small><strong>${hlCount}<span>件</span></strong></div>
    </div>
    <section class="card">
      <h3 class="card-title">この一週間</h3>
      <div class="bars">${bars}</div>
    </section>
    <section class="card">
      <h3 class="card-title">花暦 <small>（読んだ日に花が咲きます）</small></h3>
      <div class="hanagoyomi">${cells}</div>
      <div class="legend"><small>少</small><span class="cell lv0"></span><span class="cell lv1"></span><span class="cell lv2"></span><span class="cell lv3"></span><span class="cell lv4"></span><small>多</small></div>
    </section>
    ${byBook.length ? `<section class="card"><h3 class="card-title">よく読んだ本</h3><ul class="rank">${byBook.map((x) => `<li><span>${esc(x.b.title)}</span><small>${fmtMin(x.sec / 60)}</small></li>`).join("")}</ul></section>` : ""}`;
  $("#goalSel").onchange = (e) => { stats.goal = +e.target.value; saveStats(); renderStats(); };
}

/* =========================================================
   メモの画面
   ========================================================= */
function renderNotes() {
  const sel = $("#notesBook");
  const withNotes = books.filter((b) => b.highlights.length || b.bookmarks.length);
  const cur = sel.value || "all";
  sel.innerHTML = `<option value="all">すべての本</option>${withNotes.map((b) => `<option value="${b.id}" ${cur === b.id ? "selected" : ""}>${esc(b.title)}</option>`).join("")}`;
  const list = cur === "all" ? withNotes : withNotes.filter((b) => b.id === cur);
  if (!list.length) {
    $("#notesBody").innerHTML = '<div class="empty"><p class="empty-emblem" aria-hidden="true">筆</p><p>マーカーやメモはまだありません。<br />本文を長押しして文字を選ぶと、マーカーを引けます。</p></div>';
    return;
  }
  $("#notesBody").innerHTML = list.map((b) => `
    <section class="card notes-book">
      <h3 class="card-title">${esc(b.title)} <small>${esc(b.author)}</small></h3>
      <ul class="notes-list">
        ${[...b.highlights].sort((x, y) => x.sec - y.sec || x.start - y.start).map((h) => `
          <li><button class="note-item" data-book="${b.id}" data-sec="${h.sec}" data-off="${h.start}" data-len="${h.end - h.start}">
            <span class="hl-quote c${h.color}">${esc(h.text)}</span>
            ${h.note ? `<span class="hl-note">✎ ${esc(h.note)}</span>` : ""}
            <small>${esc(b.secTitles?.[h.sec] || "")} ・ ${fmtDate(h.at)}</small>
          </button></li>`).join("")}
        ${b.bookmarks.map((m) => `<li><button class="note-item" data-book="${b.id}" data-sec="${m.sec}" data-off="${m.off}"><span>🔖 ${esc(m.label)}…</span><small>${esc(b.secTitles?.[m.sec] || "")} ・ ${fmtDate(m.at)}</small></button></li>`).join("")}
      </ul>
    </section>`).join("");
}
$("#notesBook").onchange = () => renderNotes();
$("#notesBody").addEventListener("click", async (e) => {
  const it = e.target.closest(".note-item");
  if (!it) return;
  const b = books.find((x) => x.id === it.dataset.book);
  if (!b) return;
  b.pos = { sec: +it.dataset.sec, off: +it.dataset.off };
  await openBook(b.id);
  if (it.dataset.len) reader.flash(+it.dataset.off, +it.dataset.off + +it.dataset.len);
});
$("#notesExport").onclick = () => {
  const cur = $("#notesBook").value;
  exportNotes(cur && cur !== "all" ? books.filter((b) => b.id === cur) : books.filter((b) => b.highlights.length || b.bookmarks.length));
};

function download(name, text, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportNotes(list) {
  if (!list.length) { toast("書き出すメモがありません"); return; }
  const colors = { 1: "桜", 2: "山吹", 3: "若草", 4: "藤" };
  let md = `# 花琵琶文庫 マーカーとメモ\n\n書き出した日：${fmtDate(Date.now())}\n\n`;
  for (const b of list) {
    md += `## ${b.title}${b.author ? ` / ${b.author}` : ""}\n\n`;
    for (const h of [...b.highlights].sort((x, y) => x.sec - y.sec || x.start - y.start)) {
      md += `> ${h.text.replace(/\n/g, "\n> ")}\n\n`;
      md += `- ${b.secTitles?.[h.sec] || ""}（${colors[h.color] || ""}）${fmtDate(h.at)}\n`;
      if (h.note) md += `- メモ：${h.note.replace(/\n/g, " ")}\n`;
      md += "\n";
    }
  }
  download(`花琵琶文庫_メモ_${todayKey()}.md`, md, "text/markdown");
  toast("メモを書き出しました");
}

/* =========================================================
   設定の画面
   ========================================================= */
/* ---- インストール（PWA） ---- */
let installEvt = null;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function updateInstallUI() {
  $("#installBtn").hidden = isStandalone();
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; updateInstallUI(); });
window.addEventListener("appinstalled", () => {
  installEvt = null;
  updateInstallUI();
  closeSheet();
  toast("インストールしました。ホーム画面やアプリ一覧から開けます", 4000);
});
async function installApp() {
  if (installEvt) {
    const evt = installEvt;
    installEvt = null;
    evt.prompt();
    const choice = await evt.userChoice.catch(() => null);
    if (choice?.outcome !== "accepted") installEvt = evt;
    updateInstallUI();
    return;
  }
  openInstallGuide();
}
function openInstallGuide() {
  const ua = navigator.userAgent;
  const ios = isIOS();
  const android = /Android/.test(ua);
  const iosOther = ios && /CriOS|FxiOS|EdgiOS/.test(ua);
  let steps;
  if (ios) {
    steps = [
      iosOther ? "この画面を <b>Safari</b> で開きます（iPhoneでは、ほかのブラウザーでも共有メニューから追加できる場合があります）" : "画面下（iPadは上）の <b>共有ボタン</b> <span class=\"kbd\">□↑</span> をタップ",
      "メニューを下へ送り <b>「ホーム画面に追加」</b> をタップ",
      "右上の <b>「追加」</b> をタップ。ホーム画面に金の琵琶のアイコンが並びます",
    ];
  } else if (android) {
    steps = [
      "ブラウザー右上の <b>︙</b> メニューを開く",
      "<b>「アプリをインストール」</b> または <b>「ホーム画面に追加」</b> をタップ",
      "<b>「インストール」</b> をタップ。アプリ一覧とホーム画面に追加されます",
    ];
  } else {
    steps = [
      "Chrome・Edge ではアドレスバー右端の <b>インストールのアイコン</b>（画面に↓の印）をクリック",
      "見つからないときは、ブラウザーのメニューから <b>「アプリ」→「このサイトをアプリとしてインストール」</b>（Edge）や <b>「キャスト、保存、共有」→「ページをアプリとしてインストール」</b>（Chrome）を選ぶ",
      "<b>「インストール」</b> を押すと、独立したウィンドウで開けるようになります",
    ];
  }
  const body = openSheet("アプリをインストール", `
    <div class="install-hero">
      <img src="icons/icon-192.png" alt="" />
      <p class="muted">花琵琶文庫はインストールできるWebアプリです。<b class="installed-note">無料・登録不要</b>で、ストアを通さずに数秒で入ります。</p>
    </div>
    ${installEvt ? '<button class="btn btn-primary full" id="doInstall">いますぐインストール</button>' : ""}
    <ol class="install-steps">${steps.map((t) => `<li>${t}</li>`).join("")}</ol>
    <ul class="howto">
      <li>ホーム画面から1タップで、全画面で開けます</li>
      <li>電波のない場所でも、入れた本を読めます</li>
      <li>本・メモ・記録はいままでどおり端末の中だけに保存されます</li>
    </ul>`);
  $("#doInstall", body)?.addEventListener("click", installApp);
}
$("#installBtn").addEventListener("click", installApp);

// OSの「このアプリで開く」から渡されたファイルを読み込む
if ("launchQueue" in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = await Promise.all(params.files.map((h) => h.getFile()));
    importFiles(files);
  });
}

async function renderSettings() {
  let usage = "";
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) usage = `使用中 約${(est.usage / 1048576).toFixed(1)}MB`;
  } catch { /* noop */ }
  $("#settingsBody").innerHTML = `
    <section class="card">
      <h3 class="card-title">使い方</h3>
      <p class="muted">はじめての方は、本棚の『花琵琶文庫の手引き』をどうぞ。読みながら操作を覚えられます。</p>
      <ul class="howto">
        <li><b>ページをめくる</b>：縦書きは左をタップで次へ、横書きは右をタップで次へ。スワイプ・矢印キー・ホイールも使えます。</li>
        <li><b>メニュー</b>：画面の真ん中をタップ。</li>
        <li><b>マーカー</b>：本文を長押しして文字を選ぶ。</li>
        <li><b>栞</b>：メニュー上部の🔖。</li>
      </ul>
      <div class="btn-row"><button class="btn btn-ghost" id="openGuide">手引きを開く</button></div>
    </section>
    <section class="card">
      <h3 class="card-title">アプリとして使う</h3>
      ${isStandalone()
        ? '<p class="muted installed-note">インストール済みのアプリとして開いています。</p>'
        : '<p class="muted">ホーム画面やアプリ一覧に追加すると、全画面・オフラインで読めます。</p><div class="btn-row"><button class="btn btn-primary" id="setInstall">アプリをインストール</button></div>'}
    </section>
    <section class="card">
      <h3 class="card-title">データの保存とバックアップ</h3>
      <p class="muted">本・栞・マーカー・記録はこの端末のブラウザの中だけに保存されています。${usage}</p>
      <label class="toggle-line"><input type="checkbox" id="bkWithBooks" checked /> 本文も含める（ファイルが大きくなります）</label>
      <div class="btn-row">
        <button class="btn btn-primary" id="bkExport">バックアップを書き出す</button>
        <button class="btn btn-ghost" id="bkImport">バックアップを読み込む</button>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" id="reseed">付属の本をもう一度入れる</button>
        <button class="btn btn-danger" id="wipe">すべてのデータを消す</button>
      </div>
      <input type="file" id="bkFile" accept=".json,application/json" hidden />
    </section>
    <section class="card about">
      <h3 class="card-title">花琵琶文庫について</h3>
      <p>完全無料・広告なし・登録不要の読書アプリです。通信はフォントの読み込みだけで、読み込んだ本やメモが外へ送られることはありません。</p>
      <p>金地に桜と琵琶の絵、表紙の文様、付属の小説『金地の四弦』と手引きは、すべてこのアプリのための書き下ろしです。</p>
      <p class="muted">書体：しっぽり明朝・Zen オールド明朝・Zen 丸ゴシック・BIZ UDPゴシック・Klee One（いずれも SIL Open Font License）</p>
    </section>`;
  $("#openGuide").onclick = () => {
    const g = books.find((b) => b.title === "花琵琶文庫の手引き");
    if (g) openBook(g.id); else toast("手引きが見つかりません。「付属の本をもう一度入れる」をお試しください。");
  };
  $("#setInstall")?.addEventListener("click", installApp);
  $("#bkExport").onclick = exportBackup;
  $("#bkImport").onclick = () => $("#bkFile").click();
  $("#bkFile").onchange = (e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ""; };
  $("#reseed").onclick = async () => {
    localStorage.removeItem("hb.seeded");
    const before = books.length;
    await seedBooks();
    toast(books.length > before ? "付属の本を本棚に入れました" : "付属の本はすでに本棚にあります");
  };
  $("#wipe").onclick = async () => {
    if (!confirm("本・栞・マーカー・記録をすべて消します。元に戻せません。よろしいですか？")) return;
    await db.clearAll();
    localStorage.removeItem("hb.stats");
    localStorage.removeItem("hb.seeded");
    location.reload();
  };
}

async function exportBackup() {
  const withBooks = $("#bkWithBooks").checked;
  const data = {
    app: "hanabiwa-bunko",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    stats,
    books,
    contents: withBooks ? await db.allContents() : [],
  };
  download(`花琵琶文庫_バックアップ_${todayKey()}.json`, JSON.stringify(data), "application/json");
  toast("バックアップを書き出しました");
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "hanabiwa-bunko") throw new Error("花琵琶文庫のバックアップではありません");
    const contents = new Map((data.contents || []).map((c) => [c.id, c]));
    let n = 0;
    for (const b of data.books || []) {
      const existing = books.find((x) => x.id === b.id);
      const hasContent = contents.has(b.id) || existing;
      if (!hasContent) continue;
      if (contents.has(b.id)) await db.putContent(contents.get(b.id));
      await db.putBook(b);
      n++;
    }
    if (data.stats) {
      for (const [k, v] of Object.entries(data.stats.days || {})) {
        const cur = stats.days[k];
        if (!cur || cur.sec < v.sec) stats.days[k] = v;
      }
      for (const [k, v] of Object.entries(data.stats.books || {})) stats.books[k] = Math.max(stats.books[k] || 0, v);
      stats.goal = data.stats.goal || stats.goal;
      stats.speed = data.stats.speed || stats.speed;
      saveStats();
    }
    await loadBooks();
    toast(`${n}冊の本と記録を読み込みました`);
    renderSettings();
  } catch (e) {
    toast(`読み込めませんでした：${e.message}`, 4000);
  }
}

/* =========================================================
   本棚のイベント
   ========================================================= */
$("#shelf").addEventListener("click", (e) => {
  const more = e.target.closest("[data-more]");
  if (more) { openBookSheet(more.dataset.more); return; }
  const open = e.target.closest("[data-open]");
  if (open) openBook(open.dataset.open);
});
$("#continueCard").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]") || e.target.closest(".cc-cover, .cc-body") && $("#continueCard [data-open]");
  if (open) openBook(open.dataset.open);
});
$("#shelfSearch").addEventListener("input", debounce(renderShelf, 150));
$("#shelfSort").addEventListener("change", () => { localStorage.setItem("hb.sort", $("#shelfSort").value); renderShelf(); });
for (const c of $$(".shelf-filter .chip")) c.onclick = () => {
  shelfFilter = c.dataset.filter;
  for (const x of $$(".shelf-filter .chip")) x.classList.toggle("active", x === c);
  renderShelf();
};
$("#addBookFab").onclick = openImportSheet;
$("#fileInput").addEventListener("change", (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) importFiles(f); });
for (const b of $$(".nav-btn")) b.onclick = () => go(b.dataset.go);
$("#sheetClose").onclick = closeSheet;
$("#sheetBackdrop").onclick = closeSheet;

// ドラッグ＆ドロップ
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
  dragDepth++;
  $("#dropOverlay").hidden = false;
});
window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("#dropOverlay").hidden = true; });
window.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  dragDepth = 0;
  $("#dropOverlay").hidden = true;
  importFiles([...e.dataTransfer.files]);
});

window.addEventListener("popstate", () => {
  if (sheetOpen()) closeSheet();
  if (!R.el.hidden) closeReader(true);
});
window.addEventListener("pagehide", () => { if (R.book) savePos(); });

/* =========================================================
   背景の花びら・はじまり
   ========================================================= */
function startPetals() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const host = $("#petals");
  for (let i = 0; i < 9; i++) {
    const p = document.createElement("span");
    p.className = "petal";
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${-Math.random() * 18}s`;
    p.style.animationDuration = `${14 + Math.random() * 10}s`;
    p.style.setProperty("--sway", `${30 + Math.random() * 60}px`);
    p.style.setProperty("--s", (0.6 + Math.random() * 0.7).toFixed(2));
    host.appendChild(p);
  }
}

async function init() {
  $("#heroArt").innerHTML = heroSVG();
  updateInstallUI();
  $("#shelfSort").value = localStorage.getItem("hb.sort") || "recent";
  startPetals();
  requestPersist();
  try {
    await loadBooks();
    await seedBooks();
  } catch (e) {
    console.error(e);
    toast("保存領域を開けませんでした。プライベートブラウズでは使えないことがあります。", 6000);
  }
  renderShelf();
  const start = location.hash.replace("#", "");
  if (["stats", "notes", "settings"].includes(start)) go(start);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
}
init();
