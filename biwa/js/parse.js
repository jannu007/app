// 本の読み込み：TXT（青空文庫記法・Web小説のルビ記法）、青空文庫ZIP、EPUB、HTML、Markdown。
// どの形式も「章（section）ごとの安全なHTML」と「目次」に変換して保存する。
import { readZip, isZip } from "./zip.js";

/* ---------------- 共通ユーティリティ ---------------- */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const zen2han = (s) => String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const KANJI = "[\\u3005\\u3006\\u3007\\u303B\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FFFF}ヶヵ※]";
const RE_RUBY_KANJI = new RegExp(`(${KANJI}+)《([^《》\\n]{1,60})》`, "gu");
const RE_RUBY_BAR = /[｜|]([^｜|《》\n]{1,50}?)《([^《》\n]{1,60})》/g;
const RE_RUBY_BAR_PAREN = /[｜|]([^｜|（(\n]{1,50}?)[（(]([ぁ-ゖァ-ヺー・ゝゞヽヾ]{1,40})[）)]/g;
const RE_BOUTEN_DOUBLE = /《《([^《》\n]{1,80})》》/g;
const SECTION_LIMIT = 24000; // 長すぎる章は読み込みを軽くするため段落の切れ目で分ける

export function plainLength(html) {
  return html
    .replace(/<rt>[\s\S]*?<\/rt>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;|&#\d+;/g, "x").length;
}

export function looksJapanese(text) {
  const sample = text.slice(0, 4000);
  const jp = (sample.match(/[぀-ヿ一-鿿]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  return jp > latin * 0.6;
}

// 文字コードの自動判定（UTF-8 / UTF-16 / Shift_JIS / EUC-JP）
export function decodeText(u8) {
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder("utf-8").decode(u8.subarray(3));
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); } catch { /* 次へ */ }
  const candidates = ["shift_jis", "euc-jp"];
  let best = null;
  let bestScore = Infinity;
  for (const enc of candidates) {
    try {
      const t = new TextDecoder(enc).decode(u8);
      const bad = (t.match(/�/g) || []).length;
      const good = (t.slice(0, 20000).match(/[぀-ヿ]/g) || []).length;
      const score = bad * 10 - good * 0.01;
      if (score < bestScore) { bestScore = score; best = t; }
    } catch { /* 未対応 */ }
  }
  return best ?? new TextDecoder("utf-8").decode(u8);
}

const baseName = (name) => (name || "").split(/[\\/]/).pop().replace(/\.[^.]+$/, "");

/* ---------------- 青空文庫・プレーンテキスト ---------------- */

function inlineAozora(raw) {
  let s = esc(raw);
  // 外字：Unicodeが示されていれば置き換える
  s = s.replace(/※［＃[^］]*?U\+([0-9A-Fa-f]{4,5})[^］]*］/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  // 範囲指定：［＃傍点］〜［＃傍点終わり］ など
  s = s.replace(/［＃(?:白ゴマ|丸|白丸|黒丸|黒三角|白三角|二重丸|蛇の目|ばつ)?傍点］(.+?)［＃(?:白ゴマ|丸|白丸|黒丸|黒三角|白三角|二重丸|蛇の目|ばつ)?傍点終わり］/g, '<em class="bt">$1</em>');
  s = s.replace(/［＃太字］(.+?)［＃太字終わり］/g, "<strong>$1</strong>");
  s = s.replace(/［＃斜体］(.+?)［＃斜体終わり］/g, "<i>$1</i>");
  s = s.replace(/［＃縦中横］(.+?)［＃縦中横終わり］/g, '<span class="tcy">$1</span>');
  // 前方参照：X［＃「X」に傍点］
  // 置き換えは後段（直前の文字列の末尾が target のときだけ有効）で行うため印を残す
  s = s.replace(/［＃「([^」］]+)」(?:に|は)([^］]+)］/g, (m, target, kind) => `\u0001${target}\u0002${kind}\u0003`);
  s = s.replace(/([\s\S]*?)\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003/g, (m, before, target, kind) => {
    if (!before.endsWith(target)) return before;
    const head = before.slice(0, before.length - target.length);
    if (/傍点/.test(kind)) return `${head}<em class="bt">${target}</em>`;
    if (/傍線|鎖線|破線|波線/.test(kind)) return `${head}<u>${target}</u>`;
    if (/太字/.test(kind)) return `${head}<strong>${target}</strong>`;
    if (/縦中横/.test(kind)) return `${head}<span class="tcy">${target}</span>`;
    if (/小さな文字|下付き|上付き/.test(kind)) return `${head}<small>${target}</small>`;
    return before;
  });
  // その他の注記は取り除く
  s = s.replace(/［＃[^］]*］/g, "");
  // カクヨム式の傍点《《 》》
  s = s.replace(RE_BOUTEN_DOUBLE, '<em class="bt">$1</em>');
  // ルビ
  s = s.replace(RE_RUBY_BAR, "<ruby>$1<rt>$2</rt></ruby>");
  s = s.replace(RE_RUBY_BAR_PAREN, "<ruby>$1<rt>$2</rt></ruby>");
  s = s.replace(RE_RUBY_KANJI, "<ruby>$1<rt>$2</rt></ruby>");
  return s;
}

const PLAIN_HEADING = /^(?:第[0-9０-９一二三四五六七八九十百千〇零]+[章話部編節幕回巻]|序章|終章|序幕|終幕|プロローグ|エピローグ|あとがき|まえがき|はじめに|おわりに|Chapter\s*\d+|CHAPTER\s*\d+)(?:[\s　:：・.．\-－―—]+.{0,30})?$/;

export function parseAozora(text, fileName = "") {
  let lines = text.replace(/\r\n?/g, "\n").split("\n");
  const isAozora = /［＃|《[^》]+》|^底本：/m.test(text) || /^-{10,}$/m.test(text);
  const hasNoteHeadings = /［＃[^］]*見出し］/.test(text);
  let title = baseName(fileName) || "無題";
  let author = "";
  let start = 0;

  // 青空文庫のヘッダー（書名・副題・著者名、記号の説明）
  const dashIdx = lines.findIndex((l, i) => i < 40 && /^-{10,}\s*$/.test(l));
  const hasColophon = /^底本[：:]/m.test(text);
  const isAozoraFile = dashIdx >= 0 || hasColophon;
  if (isAozoraFile && lines[0] && lines[0].trim()) {
    const blankIdx = lines.findIndex((l) => !l.trim());
    const headEnd = dashIdx >= 0 && (blankIdx < 0 || dashIdx < blankIdx) ? dashIdx : blankIdx;
    const head = lines.slice(0, headEnd > 0 ? headEnd : 0).map((l) => l.replace(/［＃[^］]*］/g, "").trim()).filter(Boolean);
    if (head.length >= 1 && head.length <= 6 && head[0].length < 60) {
      title = head[0];
      const rest = head.slice(1);
      if (rest.length) {
        const last = rest[rest.length - 1];
        if (/訳$|編$/.test(last) && rest.length >= 2) {
          author = rest.slice(-2).join("　");
          if (rest.length >= 3) title += `　${rest[0]}`;
        } else {
          author = last;
          if (rest.length >= 2) title += `　${rest[0]}`;
        }
      }
      start = headEnd > 0 ? headEnd : 0;
      if (dashIdx >= 0) {
        const dash2 = lines.findIndex((l, i) => i > dashIdx && /^-{10,}\s*$/.test(l));
        start = dash2 > 0 ? dash2 + 1 : dashIdx + 1;
      }
    }
  }

  // 底本（奥付）
  let footer = [];
  const footIdx = lines.findIndex((l, i) => i > start && /^底本[：:]/.test(l));
  if (footIdx > 0) {
    footer = lines.slice(footIdx);
    lines = lines.slice(0, footIdx);
  }
  lines = lines.slice(start);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();

  const sections = [];
  const toc = [];
  let cur = { title: "", blocks: [], chars: 0 };
  let blockIndent = 0;
  let blockEnd = false;
  let headingCount = 0;
  let blankRun = 0;

  const pushSection = () => {
    if (cur.blocks.length) sections.push({ title: cur.title, html: cur.blocks.join("") });
    cur = { title: "", blocks: [], chars: 0 };
  };

  // 扉（書名と著者）
  const tobira = `<div class="tobira"><h1 class="book-title">${esc(title)}</h1>${author ? `<p class="book-author">${esc(author)}</p>` : ""}</div><div class="pb"></div>`;
  if (isAozoraFile && author) cur.blocks.push(tobira);

  for (const rawLine of lines) {
    let line = rawLine.replace(/\s+$/, "");

    if (/^［＃(?:改ページ|改丁|改段|改見開き)］$/.test(line)) { cur.blocks.push('<div class="pb"></div>'); continue; }
    let m;
    if ((m = line.match(/^［＃ここから([0-9０-９]+)字下げ(?:、折り返して[0-9０-９]+字下げ)?］$/))) { blockIndent = +zen2han(m[1]); continue; }
    if (/^［＃ここで字下げ終わり］$/.test(line)) { blockIndent = 0; continue; }
    if (/^［＃ここから(?:地付き|[0-9０-９]+字上げ|地から[0-9０-９]+字上げ)］$/.test(line)) { blockEnd = true; continue; }
    if (/^［＃ここで(?:地付き|字上げ)終わり］$/.test(line)) { blockEnd = false; continue; }

    // 見出し
    let level = 0;
    let headText = null;
    if ((m = line.match(/［＃「(.+?)」は(?:同行|窓)?(大|中|小)見出し］/))) {
      level = { 大: 1, 中: 2, 小: 3 }[m[2]];
      headText = line;
    } else if ((m = line.match(/^(?:［＃[0-9０-９]+字下げ］)?［＃(?:同行|窓)?(大|中|小)見出し］(.*?)［＃(?:同行|窓)?\1見出し終わり］/))) {
      level = { 大: 1, 中: 2, 小: 3 }[m[1]];
      headText = m[2];
    } else if (!hasNoteHeadings && line.trim().length <= 40 && PLAIN_HEADING.test(line.trim())) {
      level = 2;
      headText = line.trim();
    }
    if (level) {
      const inner = inlineAozora(headText.replace(/^[\s　]+/, "")).trim();
      const plain = inner.replace(/<rt>.*?<\/rt>/g, "").replace(/<[^>]+>/g, "");
      if (!plain) continue;
      headingCount++;
      if (level <= 2) {
        if (cur.blocks.length && cur.chars > 0) pushSection();
        else if (cur.blocks.length && sections.length === 0) { /* 扉の直後：同じ章に含める */ }
        if (!cur.title) cur.title = plain;
        toc.push({ title: plain, sec: sections.length, level, anchor: null });
        cur.blocks.push(`<h${level + 1}>${inner}</h${level + 1}>`);
      } else {
        const aid = `h${headingCount}`;
        toc.push({ title: plain, sec: sections.length, level, anchor: aid });
        cur.blocks.push(`<h4 data-aid="${aid}">${inner}</h4>`);
      }
      blankRun = 0;
      continue;
    }

    // 行頭の字下げ・地付き
    let indent = blockIndent;
    let endAlign = blockEnd;
    let endPad = 0;
    if ((m = line.match(/^［＃([0-9０-９]+)字下げ］/))) { indent = +zen2han(m[1]); line = line.slice(m[0].length); }
    if ((m = line.match(/^［＃地付き］/))) { endAlign = true; line = line.slice(m[0].length); }
    if ((m = line.match(/^［＃地から([0-9０-９]+)字上げ］/))) { endAlign = true; endPad = +zen2han(m[1]); line = line.slice(m[0].length); }
    if ((m = line.match(/(.*?)［＃地付き］(.+)$/)) && m[1]) {
      // 行の途中から地付き：二つに分ける
      cur.blocks.push(`<p>${inlineAozora(m[1])}</p>`);
      line = m[2];
      endAlign = true;
    }

    const isOnlyNote = /^(?:［＃[^］]*］)+$/.test(line);
    if (isOnlyNote) continue;

    if (!line.trim()) {
      blankRun++;
      if (blankRun <= 2) cur.blocks.push("<p><br></p>");
      continue;
    }
    blankRun = 0;

    const html = inlineAozora(line);
    const attrs = [];
    const cls = [];
    if (endAlign) cls.push("end");
    if (/^[\s　]*(?:[＊*◇◆□■○●☆★※・〜～―－]\s*){3,}[\s　]*$/.test(line)) cls.push("c", "scene");
    if (cls.length) attrs.push(`class="${cls.join(" ")}"`);
    const style = [];
    if (indent) style.push(`margin-inline-start:${indent}em`);
    if (endPad) style.push(`padding-inline-end:${endPad}em`);
    if (style.length) attrs.push(`style="${style.join(";")}"`);
    cur.blocks.push(`<p${attrs.length ? " " + attrs.join(" ") : ""}>${html}</p>`);
    cur.chars += line.length;

    if (cur.chars > SECTION_LIMIT) {
      const t = cur.title;
      pushSection();
      cur.title = `${t || title}（続き）`;
      cur.cont = true;
    }
  }
  pushSection();

  if (footer.length) {
    const fhtml = footer.filter((l) => l.trim()).map((l) => `<p>${inlineAozora(l)}</p>`).join("");
    sections.push({ title: "底本・奥付", html: `<div class="colophon"><h3>底本・奥付</h3>${fhtml}</div>` });
    toc.push({ title: "底本・奥付", sec: sections.length - 1, level: 2, anchor: null });
  }

  if (!sections.length) sections.push({ title, html: "<p>（本文がありません）</p>" });
  if (!toc.length || toc[0].sec !== 0) toc.unshift({ title: sections[0].title || "はじめ", sec: 0, level: 2, anchor: null });

  return {
    title,
    author,
    sections,
    toc,
    dir: looksJapanese(text) ? "v" : "h",
    format: isAozora ? "aozora" : "txt",
  };
}

/* ---------------- Markdown ---------------- */

function mdInline(s) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  h = h.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  h = h.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  h = h.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  h = h.replace(RE_BOUTEN_DOUBLE, '<em class="bt">$1</em>');
  h = h.replace(RE_RUBY_BAR, "<ruby>$1<rt>$2</rt></ruby>");
  h = h.replace(RE_RUBY_KANJI, "<ruby>$1<rt>$2</rt></ruby>");
  return h;
}

function joinLines(arr) {
  let out = "";
  for (const l of arr) {
    const t = l.trim();
    if (!out) { out = t; continue; }
    const a = out.slice(-1);
    const b = t[0] || "";
    out += /[\x20-\x7e]/.test(a) && /[\x20-\x7e]/.test(b) ? " " + t : t;
  }
  return out;
}

export function parseMarkdown(text, fileName = "") {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  const sections = [];
  const toc = [];
  let cur = { title: "", blocks: [] };
  let para = [];
  let list = null;
  let quote = [];
  let code = null;
  const flushPara = () => { if (para.length) { cur.blocks.push(`<p>${mdInline(joinLines(para))}</p>`); para = []; } };
  const flushList = () => { if (list) { cur.blocks.push(`<${list.tag}>${list.items.map((i) => `<li>${mdInline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { cur.blocks.push(`<blockquote><p>${mdInline(joinLines(quote))}</p></blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  const push = () => { flushAll(); if (cur.blocks.length) sections.push({ title: cur.title, html: cur.blocks.join("") }); cur = { title: "", blocks: [] }; };

  for (const line of lines) {
    if (code) {
      if (/^```/.test(line)) { cur.blocks.push(`<pre>${esc(code.join("\n"))}</pre>`); code = null; } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) { flushAll(); code = []; continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      const level = m[1].length;
      const plain = m[2].replace(/[*_`]/g, "").trim();
      if (level === 1 && !title) title = plain;
      if (level <= 2) {
        push();
        cur.title = plain;
        toc.push({ title: plain, sec: sections.length, level, anchor: null });
        cur.blocks.push(`<h${level + 1}>${mdInline(m[2])}</h${level + 1}>`);
      } else {
        flushAll();
        const aid = `m${toc.length}`;
        toc.push({ title: plain, sec: sections.length, level: 3, anchor: aid });
        cur.blocks.push(`<h4 data-aid="${aid}">${mdInline(m[2])}</h4>`);
      }
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); cur.blocks.push("<hr>"); continue; }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = line.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/))) {
      flushPara(); flushQuote();
      const tag = m[1] ? "ol" : "ul";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[2]);
      continue;
    }
    if (!line.trim()) { flushAll(); continue; }
    flushList(); flushQuote();
    para.push(line);
  }
  push();
  if (!sections.length) sections.push({ title: "", html: "<p>（本文がありません）</p>" });
  if (!toc.length || toc[0].sec !== 0) toc.unshift({ title: sections[0].title || "はじめ", sec: 0, level: 2, anchor: null });
  return { title: title || baseName(fileName) || "無題", author: "", sections, toc, dir: looksJapanese(text) ? "v" : "h", format: "md" };
}

/* ---------------- HTML / XHTML のサニタイズ ---------------- */

const BLOCK = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "hr", "pre", "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "dl", "dt", "dd"]);
const CONTAINER = new Set(["div", "section", "article", "main", "header", "footer", "aside", "nav", "body", "hgroup", "center", "address", "details", "summary", "form", "fieldset"]);
const INLINE = {
  ruby: "ruby", rb: "rb", rt: "rt", em: "em", strong: "strong", b: "b", i: "i", u: "u", s: "s", sub: "sub", sup: "sup",
  small: "small", code: "code", br: "br", span: "span", a: "span", img: "img", big: "span", font: "span", q: "span",
  cite: "i", abbr: "span", time: "span", mark: "span", del: "s", ins: "u", tt: "code", var: "i", dfn: "i", kbd: "code", samp: "code", label: "span",
};
const DROP = new Set(["script", "style", "head", "title", "meta", "link", "rp", "noscript", "iframe", "object", "embed", "video", "audio", "canvas", "template", "button", "input", "select", "textarea", "math", "wbr", "rtc"]);

function hasBlockDescendant(el) {
  for (const c of el.children) {
    const t = c.localName?.toLowerCase();
    if (BLOCK.has(t) || CONTAINER.has(t) || t === "svg" || t === "img" && el.children.length === 1 && !el.textContent.trim()) return true;
  }
  return false;
}

function alignClass(el) {
  const cls = (el.getAttribute?.("class") || "").toLowerCase();
  const st = (el.getAttribute?.("style") || "").toLowerCase();
  if (/(?:^|[\s_-])(?:center|centre|align-c|text-center|t-center)/.test(cls) || /text-align\s*:\s*center/.test(st)) return "c";
  if (/(?:right|align-r|align-end|text-end|jitsuki|chitsuki|align-bottom)/.test(cls) || /text-align\s*:\s*(?:right|end)/.test(st)) return "end";
  return "";
}

/**
 * DOMの本文を許可したタグだけのHTMLへ変換する。
 * 構造は「トップレベルにブロックが並ぶ」形へ平らにする（ページ位置の計算を安定させるため）。
 */
async function sanitizeBody(body, resolveImage) {
  const doc = document.implementation.createHTMLDocument("x");
  const root = doc.createElement("div");
  const imgs = [];
  let pending = null;
  let pendingAid = null;
  const headings = [];

  const ensureP = () => {
    if (!pending) {
      pending = doc.createElement("p");
      if (pendingAid) { pending.setAttribute("data-aid", pendingAid); pendingAid = null; }
      root.appendChild(pending);
    }
    return pending;
  };
  const flush = () => { pending = null; };

  const normText = (t) =>
    t.replace(/([^\n]?)[ \t\r]*\n[ \t\r\n]*([^\n]?)/g, (m, a, b) => (/[\x21-\x7e]/.test(a) && /[\x21-\x7e]/.test(b) ? `${a} ${b}` : `${a}${b}`)).replace(/[ \t]{2,}/g, " ");

  function mkImg(src, alt) {
    const im = doc.createElement("img");
    im.setAttribute("alt", alt || "");
    im.setAttribute("data-src", src);
    imgs.push(im);
    return im;
  }

  function walk(node, out, top) {
    if (node.nodeType === 3) {
      const t = normText(node.nodeValue);
      if (top) {
        if (!t.trim()) return;
        ensureP().appendChild(doc.createTextNode(t));
      } else out.appendChild(doc.createTextNode(t));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node.localName || node.nodeName).toLowerCase();
    if (DROP.has(tag)) return;
    const id = node.getAttribute("id");

    if (tag === "svg") {
      const images = node.getElementsByTagNameNS("*", "image");
      for (const im of images) {
        const href = im.getAttribute("href") || im.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        if (!href) continue;
        const el = mkImg(href, "");
        if (top) { flush(); const p = doc.createElement("p"); p.className = "c img"; p.appendChild(el); root.appendChild(p); }
        else out.appendChild(el);
      }
      return;
    }

    if (CONTAINER.has(tag)) {
      if (top && hasBlockDescendant(node)) {
        flush();
        if (id) pendingAid = id;
        for (const c of node.childNodes) walk(c, root, true);
        flush();
        return;
      }
      if (top) {
        flush();
        const p = doc.createElement("p");
        const a = alignClass(node);
        if (a) p.className = a;
        if (id || pendingAid) { p.setAttribute("data-aid", id || pendingAid); pendingAid = null; }
        root.appendChild(p);
        for (const c of node.childNodes) walk(c, p, false);
        return;
      }
      for (const c of node.childNodes) walk(c, out, false);
      return;
    }

    if (BLOCK.has(tag)) {
      if (top) flush();
      const el = doc.createElement(tag === "pre" ? "pre" : tag);
      const a = alignClass(node);
      if (a) el.className = a;
      if (id || (top && pendingAid)) { el.setAttribute("data-aid", id || pendingAid); pendingAid = null; }
      if (/^h[1-6]$/.test(tag)) {
        const level = +tag[1];
        const text = (() => {
          const clone = node.cloneNode(true);
          for (const rt of clone.querySelectorAll?.("rt, rp") || []) rt.remove();
          return clone.textContent.replace(/[ \t\r\n]+/g, " ").trim();
        })();
        if (text) {
          if (!el.getAttribute("data-aid")) el.setAttribute("data-aid", `h${headings.length + 1}`);
          headings.push({ level, text, aid: el.getAttribute("data-aid") });
        }
      }
      if (tag === "td" || tag === "th") {
        const cs = node.getAttribute("colspan");
        if (cs) el.setAttribute("colspan", cs);
      }
      (top ? root : out).appendChild(el);
      for (const c of node.childNodes) walk(c, el, false);
      return;
    }

    if (tag in INLINE) {
      const mapped = INLINE[tag];
      const target = top ? ensureP() : out;
      if (mapped === "img") {
        const src = node.getAttribute("src") || node.getAttribute("href") || node.getAttributeNS?.("http://www.w3.org/1999/xlink", "href");
        if (src) {
          const im = mkImg(src, node.getAttribute("alt"));
          if (top && !target.textContent.trim()) target.classList.add("c", "img");
          target.appendChild(im);
        }
        return;
      }
      if (mapped === "br") { target.appendChild(doc.createElement("br")); return; }
      let el;
      const cls = (node.getAttribute("class") || "").toLowerCase();
      const style = (node.getAttribute("style") || "").toLowerCase();
      if (/tcy|tate-?chu-?yoko|text-combine|tatechuyoko/.test(cls) || /text-combine/.test(style)) {
        el = doc.createElement("span");
        el.className = "tcy";
      } else if (/sesame|bou-?ten|boten|em-dot|emphasis|em-circle|em-triangle/.test(cls) || /text-emphasis/.test(style)) {
        el = doc.createElement("em");
        el.className = "bt";
      } else if (/(?:^|\s)(?:gfont|bold|b)(?:\s|$)/.test(cls) || /font-weight\s*:\s*(?:bold|[6-9]00)/.test(style)) {
        el = doc.createElement("strong");
      } else {
        el = doc.createElement(mapped);
      }
      if (id) el.setAttribute("data-aid", id);
      target.appendChild(el);
      for (const c of node.childNodes) walk(c, el, false);
      // 中身のない span は外す
      if (el.localName === "span" && !el.className && !el.getAttribute("data-aid")) {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      }
      return;
    }

    // 不明なタグは中身だけ使う
    for (const c of node.childNodes) walk(c, top ? root : out, top);
  }

  for (const c of body.childNodes) walk(c, root, true);

  // 段落の前後の余白を整える
  for (const p of root.querySelectorAll("p")) {
    const f = p.firstChild;
    if (f && f.nodeType === 3) f.nodeValue = f.nodeValue.replace(/^[ \t\n]+/, "");
    const l = p.lastChild;
    if (l && l.nodeType === 3) l.nodeValue = l.nodeValue.replace(/[ \t\n]+$/, "");
    if (!p.childNodes.length || (p.childNodes.length === 1 && p.firstChild.nodeType === 3 && !p.firstChild.nodeValue)) {
      p.innerHTML = "<br>";
    }
  }

  // 画像の解決
  await Promise.all(imgs.map(async (im) => {
    const src = im.getAttribute("data-src");
    im.removeAttribute("data-src");
    let url = null;
    if (/^data:image\//.test(src)) url = src;
    else if (resolveImage) url = await resolveImage(src).catch(() => null);
    if (url) im.setAttribute("src", url);
    else im.remove();
  }));

  return { html: root.innerHTML, headings, text: root.textContent };
}

export async function parseHTML(text, fileName = "") {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const title = doc.querySelector("title")?.textContent.trim() || doc.querySelector("h1")?.textContent.trim() || baseName(fileName) || "無題";
  const author = doc.querySelector('meta[name="author"]')?.getAttribute("content") || "";
  const { html, headings } = await sanitizeBody(doc.body || doc.documentElement, null);
  // h1/h2 で章に分ける
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const sections = [];
  const toc = [];
  let cur = [];
  let curTitle = "";
  const push = () => { if (cur.length) sections.push({ title: curTitle, html: cur.join("") }); cur = []; curTitle = ""; };
  for (const el of [...tmp.children]) {
    const t = el.localName;
    if ((t === "h1" || t === "h2") && cur.length) push();
    if (/^h[1-3]$/.test(t)) {
      const plain = el.textContent.trim();
      if (plain) {
        if (t !== "h3") { if (!curTitle) curTitle = plain; toc.push({ title: plain, sec: sections.length, level: t === "h1" ? 1 : 2, anchor: null }); }
        else toc.push({ title: plain, sec: sections.length, level: 3, anchor: el.getAttribute("data-aid") });
      }
    }
    cur.push(el.outerHTML);
  }
  push();
  void headings;
  if (!sections.length) sections.push({ title, html: "<p>（本文がありません）</p>" });
  if (!toc.length || toc[0].sec !== 0) toc.unshift({ title: sections[0].title || "はじめ", sec: 0, level: 2, anchor: null });
  return { title, author, sections, toc, dir: looksJapanese(tmp.textContent) ? "v" : "h", format: "html" };
}

/* ---------------- EPUB ---------------- */

function parseXML(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}
function byTag(doc, name) {
  return [...doc.getElementsByTagNameNS("*", name)];
}
function dirname(p) {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i + 1) : "";
}
function resolvePath(base, href) {
  let h = href.split("#")[0];
  try { h = decodeURIComponent(h); } catch { /* そのまま */ }
  if (/^[a-z]+:/i.test(h)) return h;
  const parts = (h.startsWith("/") ? h.slice(1) : base + h).split("/");
  const out = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", avif: "image/avif" };

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function shrinkImage(blob, maxDim = 1600, quality = 0.85) {
  if (blob.type === "image/svg+xml" || blob.type === "image/gif") return blobToDataURL(blob);
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && blob.size < 600 * 1024) { bmp.close?.(); return blobToDataURL(blob); }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c.toDataURL("image/jpeg", quality);
  } catch {
    return blobToDataURL(blob);
  }
}

export async function parseEpub(buffer, fileName = "") {
  const zip = readZip(buffer);
  if (zip.has("META-INF/encryption.xml")) {
    const enc = await zip.text("META-INF/encryption.xml");
    if (enc && /EncryptedData/.test(enc) && !/obfuscation/i.test(enc.match(/Algorithm="([^"]+)"/)?.[1] || "")) {
      throw new Error("DRM（コピー防止）付きのEPUBは開けません。DRMフリーの本をお使いください。");
    }
  }
  const container = await zip.text("META-INF/container.xml");
  if (!container) throw new Error("EPUBの構造が読み取れませんでした（container.xml がありません）。");
  const rootPath = parseXML(container).getElementsByTagNameNS("*", "rootfile")[0]?.getAttribute("full-path");
  if (!rootPath) throw new Error("EPUBの構造が読み取れませんでした。");
  const opf = parseXML(await zip.text(rootPath));
  const base = dirname(rootPath);

  const title = byTag(opf, "title")[0]?.textContent.trim() || baseName(fileName) || "無題";
  const author = byTag(opf, "creator").map((c) => c.textContent.trim()).filter(Boolean).join("、");

  const items = new Map();
  for (const it of byTag(opf, "item")) {
    items.set(it.getAttribute("id"), {
      id: it.getAttribute("id"),
      href: resolvePath(base, it.getAttribute("href") || ""),
      type: it.getAttribute("media-type") || "",
      props: it.getAttribute("properties") || "",
    });
  }
  const spineEl = byTag(opf, "spine")[0];
  const ppd = spineEl?.getAttribute("page-progression-direction");
  const refs = byTag(opf, "itemref").filter((r) => r.getAttribute("linear") !== "no").map((r) => items.get(r.getAttribute("idref"))).filter(Boolean);

  // 縦書き指定の有無（CSSを見る）
  let vertical = ppd === "rtl";
  if (!vertical) {
    for (const it of items.values()) {
      if (it.type === "text/css") {
        const css = await zip.text(it.href).catch(() => "");
        if (css && /vertical-rl/.test(css)) { vertical = true; break; }
      }
    }
  }

  // 画像のキャッシュ
  const imgCache = new Map();
  const resolver = (docPath) => async (src) => {
    const p = resolvePath(dirname(docPath), src);
    if (imgCache.has(p)) return imgCache.get(p);
    const promise = (async () => {
      const bytes = await zip.bytes(p);
      if (!bytes) return null;
      const ext = p.split(".").pop().toLowerCase();
      return shrinkImage(new Blob([bytes], { type: MIME[ext] || "image/jpeg" }));
    })();
    imgCache.set(p, promise);
    return promise;
  };

  // 目次
  const tocRaw = [];
  const navItem = [...items.values()].find((i) => /\bnav\b/.test(i.props));
  if (navItem) {
    const navText = await zip.text(navItem.href);
    if (navText) {
      let nav = parseXML(navText);
      if (nav.getElementsByTagName("parsererror").length) nav = new DOMParser().parseFromString(navText, "text/html");
      const navs = byTag(nav, "nav");
      const tocNav = navs.find((n) => /toc/.test(n.getAttribute("epub:type") || n.getAttributeNS("http://www.idpf.org/2007/ops", "type") || "")) || navs[0];
      const walkOl = (ol, level) => {
        for (const li of [...ol.children].filter((c) => c.localName === "li")) {
          const a = [...li.children].find((c) => c.localName === "a" || c.localName === "span");
          if (a) {
            const href = a.getAttribute("href");
            const label = a.textContent.replace(/[ \t\r\n]+/g, " ").trim();
            if (label) tocRaw.push({ title: label, level, path: href ? resolvePath(dirname(navItem.href), href) : null, frag: href?.split("#")[1] || null });
          }
          const sub = [...li.children].find((c) => c.localName === "ol");
          if (sub) walkOl(sub, level + 1);
        }
      };
      const ol = tocNav && [...tocNav.getElementsByTagNameNS("*", "ol")][0];
      if (ol) walkOl(ol, 1);
    }
  }
  if (!tocRaw.length) {
    const ncxId = spineEl?.getAttribute("toc");
    const ncxItem = (ncxId && items.get(ncxId)) || [...items.values()].find((i) => i.type === "application/x-dtbncx+xml");
    if (ncxItem) {
      const ncx = parseXML(await zip.text(ncxItem.href) || "<x/>");
      const walkNp = (parent, level) => {
        for (const np of [...parent.children].filter((c) => c.localName === "navPoint")) {
          const label = np.getElementsByTagNameNS("*", "text")[0]?.textContent.trim();
          const src = np.getElementsByTagNameNS("*", "content")[0]?.getAttribute("src");
          if (label && src) tocRaw.push({ title: label, level, path: resolvePath(dirname(ncxItem.href), src), frag: src.split("#")[1] || null });
          walkNp(np, level + 1);
        }
      };
      const navMap = ncx.getElementsByTagNameNS("*", "navMap")[0];
      if (navMap) walkNp(navMap, 1);
    }
  }

  const sections = [];
  const pathToSec = new Map();
  for (const it of refs) {
    if (!/x?html|xml/.test(it.type) && !/\.x?html?$/i.test(it.href)) continue;
    const text = await zip.text(it.href);
    if (!text) continue;
    let doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
    if (doc.getElementsByTagName("parsererror").length || !doc.body) doc = new DOMParser().parseFromString(text, "text/html");
    const body = doc.body || doc.getElementsByTagNameNS("*", "body")[0] || doc.documentElement;
    const { html, headings, text: plain } = await sanitizeBody(body, resolver(it.href));
    const hasImg = /<img /.test(html);
    if (!plain.trim() && !hasImg) continue;
    pathToSec.set(it.href, sections.length);
    sections.push({ title: headings[0]?.text || "", html, path: it.href });
  }
  if (!sections.length) throw new Error("本文が見つかりませんでした。");

  // 目次を章番号へ対応づける
  const toc = [];
  for (const t of tocRaw) {
    if (!t.path) continue;
    let sec = pathToSec.get(t.path);
    if (sec === undefined) continue;
    toc.push({ title: t.title, sec, level: Math.min(3, t.level + 1), anchor: t.frag || null });
    if (!t.frag && sections[sec] && !sections[sec].tocTitle) sections[sec].tocTitle = t.title;
  }
  for (const s of sections) {
    if (s.tocTitle) s.title = s.tocTitle;
    delete s.tocTitle;
    delete s.path;
  }
  // 目次のない章は直前の目次の名前を引き継ぐ
  let last = "";
  for (let i = 0; i < sections.length; i++) {
    const hit = toc.find((t) => t.sec === i);
    if (hit) last = hit.title;
    if (!sections[i].title) sections[i].title = last;
  }
  if (!toc.length) sections.forEach((s, i) => { if (s.title) toc.push({ title: s.title, sec: i, level: 2, anchor: null }); });
  if (!toc.length || toc[0].sec !== 0) toc.unshift({ title: "はじめ", sec: 0, level: 2, anchor: null });

  // 表紙
  let cover = null;
  let coverItem = [...items.values()].find((i) => /cover-image/.test(i.props));
  if (!coverItem) {
    const metaCover = byTag(opf, "meta").find((m) => m.getAttribute("name") === "cover");
    if (metaCover) coverItem = items.get(metaCover.getAttribute("content"));
  }
  if (!coverItem) coverItem = [...items.values()].find((i) => /^image\//.test(i.type) && /cover/i.test(i.href + i.id));
  if (coverItem) {
    const b = await zip.bytes(coverItem.href).catch(() => null);
    if (b) cover = await shrinkImage(new Blob([b], { type: coverItem.type || "image/jpeg" }), 480, 0.82).catch(() => null);
  }

  const sample = sections.slice(0, 3).map((s) => s.html).join("").replace(/<[^>]+>/g, "");
  return { title, author, sections, toc, dir: vertical ? "v" : looksJapanese(sample) && ppd !== "ltr" ? "v" : "h", cover, format: "epub" };
}

/* ---------------- 入口 ---------------- */

export async function importFile(file) {
  const name = file.name || "";
  const ext = (name.split(".").pop() || "").toLowerCase();
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);

  if (ext === "epub") return parseEpub(buf, name);
  if (isZip(u8)) {
    const zip = readZip(buf);
    if (zip.has("META-INF/container.xml")) return parseEpub(buf, name);
    // 青空文庫ZIP：中のTXTを探す
    const txt = zip.names.find((n) => /\.txt$/i.test(n));
    if (!txt) throw new Error("ZIPの中に読めるテキストファイルが見つかりませんでした。");
    const bytes = await zip.bytes(txt);
    const text = decodeText(bytes);
    const book = parseAozora(text, txt);
    // 青空文庫ZIPの挿絵（png）も取り込む
    for (const n of zip.names.filter((n) => /\.(png|jpe?g|gif)$/i.test(n))) {
      const short = n.split("/").pop();
      if (!book.sections.some((s) => s.html.includes(short))) continue;
      const b = await zip.bytes(n);
      const url = await shrinkImage(new Blob([b], { type: MIME[short.split(".").pop().toLowerCase()] || "image/png" }));
      for (const s of book.sections) s.html = s.html.split(short).join(url);
    }
    return book;
  }
  const text = decodeText(u8);
  if (ext === "md" || ext === "markdown") return parseMarkdown(text, name);
  if (ext === "html" || ext === "htm" || ext === "xhtml" || /^\s*<(?:!doctype|html)/i.test(text.slice(0, 200))) return parseHTML(text, name);
  return parseAozora(text, name);
}

export function parsePasted(text, title) {
  const book = /^\s*#\s/.test(text) ? parseMarkdown(text, title) : parseAozora(text, title);
  if (title) book.title = title;
  return book;
}
