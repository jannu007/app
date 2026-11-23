// 読書エンジン：縦書き／横書き、ページめくり／スクロール、本文中の位置（文字オフセット）の管理。
// 位置は「章番号＋章内の文字オフセット（ルビの読みは数えない）」で扱うため、
// 文字サイズや画面サイズを変えても同じ場所に戻れる。

export const FONTS = {
  mincho: { label: "しっぽり明朝", css: '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif' },
  oldmincho: { label: "Zen オールド明朝", css: '"Zen Old Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif' },
  klee: { label: "クレー（教科書風）", css: '"Klee One", "Hiragino Mincho ProN", serif' },
  maru: { label: "Zen 丸ゴシック", css: '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif' },
  gothic: { label: "BIZ UDPゴシック", css: '"BIZ UDPGothic", "Hiragino Sans", "Yu Gothic", sans-serif' },
  system: { label: "端末の明朝体", css: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", "Noto Serif CJK JP", serif' },
};

const SKIP_TEXT = (n) => {
  for (let p = n.parentNode; p; p = p.parentNode) {
    const t = p.localName;
    if (t === "rt" || t === "rp") return true;
    if (p.classList?.contains("rd-flow")) return false;
  }
  return false;
};

export function createReader(els, hooks) {
  const { viewport, flow } = els;
  const st = {
    book: null,
    content: null,
    sec: 0,
    page: 0,
    pages: 1,
    vertical: true,
    paged: true,
    spread: false,
    W: 0,
    H: 0,
    G: 48,
    step: 1,
    index: null, // {nodes:[{node,start,len}], total, blockStarts:[]}
    rendering: null,
    settings: null,
  };

  /* ---------- 文字オフセット ---------- */

  function buildIndex() {
    const nodes = [];
    const blockStarts = [];
    let total = 0;
    const blocks = [...flow.children];
    for (const b of blocks) {
      blockStarts.push(total);
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (SKIP_TEXT(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      let n;
      while ((n = w.nextNode())) {
        const len = n.nodeValue.length;
        if (!len) continue;
        nodes.push({ node: n, start: total, len });
        total += len;
      }
    }
    st.index = { nodes, total, blockStarts, blocks };
  }

  function locate(off) {
    const { nodes } = st.index;
    if (!nodes.length) return null;
    let lo = 0, hi = nodes.length - 1;
    if (off >= st.index.total) { const last = nodes[hi]; return { node: last.node, offset: last.len }; }
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].start <= off) lo = mid; else hi = mid - 1;
    }
    const e = nodes[lo];
    return { node: e.node, offset: Math.min(off - e.start, e.len) };
  }

  function rangeAt(start, end) {
    const a = locate(start);
    const b = locate(Math.max(start, end));
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }

  function offsetOf(node, offset) {
    if (!st.index) return 0;
    // ルビの読みの中ならルビの先頭へ
    for (let p = node.nodeType === 3 ? node.parentNode : node; p && p !== flow; p = p.parentNode) {
      if (p.localName === "rt" || p.localName === "rp") {
        const ruby = p.closest("ruby");
        if (ruby) { node = ruby; offset = 0; }
        break;
      }
    }
    if (node.nodeType === 3) {
      const e = st.index.nodes.find((x) => x.node === node);
      if (e) return e.start + Math.min(offset, e.len);
    }
    // 要素の境界：そこより前にある文字数を数える
    const r = document.createRange();
    r.setStart(flow, 0);
    try { r.setEnd(node, offset); } catch { return 0; }
    let count = 0;
    for (const e of st.index.nodes) {
      if (r.comparePoint(e.node, 0) > 0) break;
      if (r.comparePoint(e.node, e.len) <= 0) count = e.start + e.len;
      else { count = e.start + (r.endContainer === e.node ? r.endOffset : 0); break; }
    }
    return count;
  }

  /* ---------- 配置とページ計算 ---------- */

  function firstRect(range) {
    const rects = range.getClientRects();
    for (const r of rects) if (r.width || r.height) return r;
    return range.getBoundingClientRect();
  }

  function pageOfRect(rect) {
    const fr = flow.getBoundingClientRect();
    const pos = st.vertical ? rect.top - fr.top : rect.left - fr.left;
    return Math.max(0, Math.min(st.pages - 1, Math.floor((pos + 2) / st.step)));
  }

  function pageOfOffset(off) {
    if (!st.index.nodes.length) return 0;
    const o = Math.min(off, st.index.total - 1);
    const r = rangeAt(o, o + 1);
    if (!r) return 0;
    return pageOfRect(firstRect(r));
  }

  function pageOfElement(el) {
    const rects = el.getClientRects();
    return rects.length ? pageOfRect(rects[0]) : 0;
  }

  function layout() {
    const s = st.settings;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    st.W = Math.max(100, Math.floor(vw));
    st.H = Math.max(100, Math.floor(vh));
    st.spread = !st.vertical && st.paged && st.W >= 860 && s.spread !== false;
    const fs = flow.style;
    fs.setProperty("--pageW", `${st.W}px`);
    fs.setProperty("--pageH", `${st.H}px`);
    if (st.paged) {
      st.G = st.vertical ? 40 : Math.max(40, Math.round(st.W * 0.06));
      fs.width = `${st.W}px`;
      fs.height = `${st.H}px`;
      fs.columnGap = `${st.G}px`;
      if (st.vertical) {
        fs.columnWidth = `${st.H}px`;
        st.step = st.H + st.G;
      } else {
        const colW = st.spread ? (st.W - st.G) / 2 : st.W;
        fs.columnWidth = `${colW}px`;
        st.step = st.W + st.G;
      }
      fs.columnFill = "auto";
    } else {
      fs.width = st.vertical ? "auto" : "";
      fs.height = st.vertical ? `${st.H}px` : "";
      fs.columnWidth = "";
      fs.columnGap = "";
      fs.columnFill = "";
      fs.transform = "";
    }
  }

  function measure() {
    if (!st.paged) { st.pages = 1; return; }
    const fr = flow.getBoundingClientRect();
    let extent = 0;
    const kids = [...flow.children];
    for (let i = kids.length - 1; i >= 0 && i >= kids.length - 6; i--) {
      const rects = kids[i].getClientRects();
      for (const r of rects) {
        if (!r.width && !r.height) continue;
        const e = st.vertical ? r.bottom - fr.top : r.right - fr.left;
        if (e > extent) extent = e;
      }
    }
    st.pages = Math.max(1, Math.ceil((extent - 2) / st.step));
  }

  function applyTransform() {
    if (!st.paged) return;
    const d = st.page * st.step;
    flow.style.transform = st.vertical ? `translate3d(0, ${-d}px, 0)` : `translate3d(${-d}px, 0, 0)`;
  }

  function animate(dir) {
    const kind = st.settings.anim;
    if (!dir || kind === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // 縦書きでは次のページは左から、横書きでは右から入ってくる
    const sign = (st.vertical ? -1 : 1) * (dir === "next" ? 1 : -1);
    const frames = kind === "fade"
      ? [{ opacity: 0.2 }, { opacity: 1 }]
      : [{ opacity: 0.25, transform: `translateX(${sign * 34}px)` }, { opacity: 1, transform: "none" }];
    viewport.animate(frames, { duration: kind === "fade" ? 260 : 300, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  /* ---------- 本文の描画 ---------- */

  function addTcy() {
    const re = /(?<![0-9A-Za-z.,:/\-+])([0-9]{1,2}|[!?]{1,2})(?![0-9A-Za-z.,:/\-%+])/g;
    const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentNode;
        if (!p || p.closest("rt, rp, .tcy, pre, code")) return NodeFilter.FILTER_REJECT;
        return /[0-9!?]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);
    for (const t of targets) {
      const text = t.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let m;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement("span");
        span.className = "tcy";
        span.textContent = m[1];
        frag.appendChild(span);
        last = m.index + m[1].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      t.parentNode.replaceChild(frag, t);
    }
  }

  function wrapRange(start, end, make) {
    if (end <= start) return;
    const pieces = [];
    for (const e of st.index.nodes) {
      const a = Math.max(start, e.start);
      const b = Math.min(end, e.start + e.len);
      if (a < b) pieces.push({ node: e.node, a: a - e.start, b: b - e.start });
      if (e.start >= end) break;
    }
    for (const p of pieces) {
      let node = p.node;
      if (p.b < node.nodeValue.length) node.splitText(p.b);
      if (p.a > 0) node = node.splitText(p.a);
      const w = make();
      node.parentNode.insertBefore(w, node);
      w.appendChild(node);
    }
  }

  function paintHighlights() {
    const list = hooks.getHighlights?.(st.sec) || [];
    if (!list.length) return;
    for (const h of [...list].sort((a, b) => a.start - b.start)) {
      wrapRange(h.start, h.end, () => {
        const m = document.createElement("mark");
        m.className = `hl c${h.color || 1}${h.note ? " has-note" : ""}`;
        m.dataset.id = h.id;
        return m;
      });
      buildIndex();
    }
  }

  async function waitImages() {
    const imgs = [...flow.querySelectorAll("img")];
    await Promise.all(imgs.map((im) => (im.complete ? null : Promise.race([
      new Promise((r) => { im.onload = im.onerror = r; }),
      new Promise((r) => setTimeout(r, 1500)),
    ]))));
  }

  async function render(sec, target = {}, dir = null) {
    const token = Symbol("render");
    st.rendering = token;
    st.sec = Math.max(0, Math.min(st.content.sections.length - 1, sec));
    const html = st.content.sections[st.sec].html;
    flow.innerHTML = html + (st.paged ? "" : `<div class="sec-end">${st.sec < st.content.sections.length - 1 ? '<button class="next-sec-btn" type="button">次の章へ</button>' : '<p class="fin">― 終 ―</p>'}</div>`);
    if (st.vertical) addTcy();
    buildIndex();
    paintHighlights();
    layout();
    await waitImages();
    if (st.rendering !== token) return;
    measure();
    placeAt(target);
    animate(dir);
    emit();
  }

  function placeAt(target) {
    if (st.paged) {
      let p = 0;
      if (target.page === "last") p = st.pages - 1;
      else if (typeof target.off === "number") p = pageOfOffset(target.off);
      else if (target.anchor) {
        const el = flow.querySelector(`[data-aid="${CSS.escape(target.anchor)}"]`);
        p = el ? pageOfElement(el) : 0;
      } else if (typeof target.ratio === "number") p = Math.round(target.ratio * (st.pages - 1));
      else if (typeof target.page === "number") p = target.page;
      st.page = Math.max(0, Math.min(st.pages - 1, p));
      applyTransform();
    } else {
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
      let off = null;
      if (target.page === "last") {
        if (st.vertical) viewport.scrollLeft = -viewport.scrollWidth; else viewport.scrollTop = viewport.scrollHeight;
        return;
      }
      if (typeof target.off === "number") off = target.off;
      else if (target.anchor) {
        const el = flow.querySelector(`[data-aid="${CSS.escape(target.anchor)}"]`);
        if (el) scrollToRect(el.getBoundingClientRect());
        return;
      } else if (typeof target.ratio === "number") {
        if (st.vertical) viewport.scrollLeft = -target.ratio * (viewport.scrollWidth - viewport.clientWidth);
        else viewport.scrollTop = target.ratio * (viewport.scrollHeight - viewport.clientHeight);
        return;
      }
      if (off !== null && off > 0) {
        const r = rangeAt(off, Math.min(off + 1, st.index.total));
        if (r) scrollToRect(firstRect(r));
      }
    }
  }

  function scrollToRect(rect) {
    const vr = viewport.getBoundingClientRect();
    if (st.vertical) viewport.scrollLeft += rect.right - vr.right + 6;
    else viewport.scrollTop += rect.top - vr.top - 6;
  }

  /* ---------- 現在位置 ---------- */

  function offsetAtViewStart() {
    const idx = st.index;
    if (!idx || !idx.nodes.length) return 0;
    let visibleOrAfter;
    if (st.paged) {
      const p = st.page;
      if (p === 0) return 0;
      visibleOrAfter = (rect) => pageOfRect(rect) >= p;
    } else {
      const vr = viewport.getBoundingClientRect();
      visibleOrAfter = st.vertical ? (rect) => rect.left < vr.right - 2 : (rect) => rect.bottom > vr.top + 2;
    }
    // 二分探索：見えている最初の文字
    let lo = 0, hi = idx.total - 1;
    const test = (o) => {
      const r = rangeAt(o, o + 1);
      return r ? visibleOrAfter(firstRect(r)) : true;
    };
    if (!test(hi)) return hi;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (test(mid)) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  function scrollRatio() {
    if (st.vertical) {
      const max = viewport.scrollWidth - viewport.clientWidth;
      return max > 0 ? Math.min(1, Math.abs(viewport.scrollLeft) / max) : 1;
    }
    const max = viewport.scrollHeight - viewport.clientHeight;
    return max > 0 ? Math.min(1, viewport.scrollTop / max) : 1;
  }

  function sectionRatio() {
    if (st.paged) return st.pages > 1 ? st.page / (st.pages - 1) : 1;
    return scrollRatio();
  }

  function position() {
    return { sec: st.sec, off: offsetAtViewStart(), ratio: sectionRatio() };
  }

  function emit() {
    hooks.onChange?.({ sec: st.sec, page: st.page, pages: st.pages, ratio: sectionRatio(), paged: st.paged });
  }

  /* ---------- 操作 ---------- */

  async function next() {
    if (!st.content) return;
    if (st.paged) {
      if (st.page < st.pages - 1) { st.page++; applyTransform(); animate("next"); emit(); hooks.onTurn?.(1); return true; }
    } else {
      const before = st.vertical ? viewport.scrollLeft : viewport.scrollTop;
      const amount = (st.vertical ? viewport.clientWidth : viewport.clientHeight) * 0.9;
      if (st.vertical) viewport.scrollBy({ left: -amount, behavior: "smooth" }); else viewport.scrollBy({ top: amount, behavior: "smooth" });
      if (scrollRatio() < 0.999 || before !== (st.vertical ? viewport.scrollLeft : viewport.scrollTop)) { hooks.onTurn?.(1); return true; }
    }
    if (st.sec < st.content.sections.length - 1) {
      await render(st.sec + 1, { page: 0 }, "next");
      hooks.onTurn?.(1);
      return true;
    }
    hooks.onEnd?.();
    return false;
  }

  async function prev() {
    if (!st.content) return;
    if (st.paged) {
      if (st.page > 0) { st.page--; applyTransform(); animate("prev"); emit(); return true; }
    } else {
      const amount = (st.vertical ? viewport.clientWidth : viewport.clientHeight) * 0.9;
      if (scrollRatio() > 0.001) {
        if (st.vertical) viewport.scrollBy({ left: amount, behavior: "smooth" }); else viewport.scrollBy({ top: -amount, behavior: "smooth" });
        return true;
      }
    }
    if (st.sec > 0) { await render(st.sec - 1, { page: "last" }, "prev"); return true; }
    return false;
  }

  async function goTo(target, dir = null) {
    const sec = target.sec ?? st.sec;
    if (sec !== st.sec || !st.index) await render(sec, target, dir);
    else { placeAt(target); animate(dir); emit(); }
  }

  async function relayout() {
    if (!st.content) return;
    const pos = position();
    await render(pos.sec, { off: pos.off });
  }

  async function open(book, content, pos, settings) {
    st.book = book;
    st.content = content;
    st.settings = settings;
    st.index = null;
    configure(settings);
    await render(pos?.sec || 0, pos && typeof pos.off === "number" ? { off: pos.off } : { ratio: pos?.ratio || 0 });
  }

  function configure(settings) {
    st.settings = settings;
    const mode = settings.mode === "auto" ? (st.book?.dir || "v") : settings.mode;
    st.vertical = mode === "v";
    st.paged = settings.flow !== "scroll";
    els.root.classList.toggle("is-vertical", st.vertical);
    els.root.classList.toggle("is-horizontal", !st.vertical);
    els.root.classList.toggle("is-paged", st.paged);
    els.root.classList.toggle("is-scroll", !st.paged);
    els.root.classList.toggle("no-justify", !settings.justify);
    for (const c of [...els.root.classList]) if (c.startsWith("theme-")) els.root.classList.remove(c);
    els.root.classList.add(`theme-${settings.theme}`);
    const rs = els.root.style;
    rs.setProperty("--rd-font", (FONTS[settings.font] || FONTS.mincho).css);
    rs.setProperty("--rd-size", `${settings.size}px`);
    rs.setProperty("--rd-lh", settings.lh);
    rs.setProperty("--rd-ls", `${settings.ls}em`);
    rs.setProperty("--rd-mx", `${settings.margin}px`);
    rs.setProperty("--rd-weight", settings.bold ? 600 : 400);
    els.dim.style.opacity = String(Math.max(0, 1 - settings.bright) * 0.85);
    viewport.style.writingMode = !st.paged && st.vertical ? "vertical-rl" : "";
  }

  async function applySettings(settings) {
    const pos = st.content ? position() : null;
    configure(settings);
    if (pos) await render(pos.sec, { off: pos.off });
  }

  // 選択範囲 → 章内オフセット
  function selectionOffsets() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!flow.contains(r.commonAncestorContainer)) return null;
    const start = offsetOf(r.startContainer, r.startOffset);
    const end = offsetOf(r.endContainer, r.endOffset);
    if (end <= start) return null;
    return { start, end, text: textBetween(start, end), rect: r.getBoundingClientRect() };
  }

  function textBetween(start, end) {
    let out = "";
    for (const e of st.index.nodes) {
      if (e.start >= end) break;
      const a = Math.max(start, e.start);
      const b = Math.min(end, e.start + e.len);
      if (a < b) out += e.node.nodeValue.slice(a - e.start, b - e.start);
    }
    return out;
  }

  // 音読用：ルビは読みに置き換え、文ごとに区切る
  function speechChunks(fromOff) {
    const chunks = [];
    let cur = null;
    let off = 0;
    const startChunk = (o) => { cur = { start: o, text: "" }; };
    const endChunk = () => {
      if (cur && cur.text.trim()) chunks.push({ ...cur, end: off });
      cur = null;
    };
    const visit = (node) => {
      if (node.nodeType === 3) {
        if (SKIP_TEXT(node)) return;
        const t = node.nodeValue;
        for (let i = 0; i < t.length; i++) {
          if (!cur) startChunk(off);
          cur.text += t[i];
          off++;
          if (/[。！？!?」』]/.test(t[i]) && !/[」』）)]/.test(t[i + 1] || "") || cur.text.length > 180) endChunk();
        }
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.localName === "rt" || node.localName === "rp") return;
      if (node.localName === "ruby") {
        const rt = [...node.querySelectorAll("rt")].map((x) => x.textContent).join("");
        let baseLen = 0;
        const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) if (!SKIP_TEXT(n)) baseLen += n.nodeValue.length;
        if (!cur) startChunk(off);
        cur.text += rt || node.textContent;
        off += baseLen;
        return;
      }
      for (const c of node.childNodes) visit(c);
    };
    for (const b of flow.children) {
      if (b.classList.contains("sec-end")) continue;
      visit(b);
      endChunk();
    }
    return chunks.filter((c) => c.end > fromOff);
  }

  function ensureVisible(off, dir = "next") {
    if (!st.index || !st.index.nodes.length) return;
    if (st.paged) {
      const p = pageOfOffset(off);
      if (p !== st.page) { const d = p > st.page ? "next" : "prev"; st.page = p; applyTransform(); animate(d || dir); emit(); }
    } else {
      const r = rangeAt(off, Math.min(off + 1, st.index.total));
      if (!r) return;
      const rect = firstRect(r);
      const vr = viewport.getBoundingClientRect();
      const outside = st.vertical ? rect.left < vr.left || rect.right > vr.right : rect.top < vr.top || rect.bottom > vr.bottom;
      if (outside) scrollToRect(rect);
    }
  }

  function setHighlight(name, start, end) {
    if (!("highlights" in CSS) || typeof Highlight === "undefined") return false;
    if (start == null) { CSS.highlights.delete(name); return true; }
    const r = rangeAt(start, end);
    if (r) CSS.highlights.set(name, new Highlight(r));
    return true;
  }

  function flash(start, end) {
    if (!setHighlight("flash", start, end)) return;
    clearTimeout(st.flashTimer);
    st.flashTimer = setTimeout(() => setHighlight("flash", null), 2400);
  }

  function isOffsetOnPage(off) {
    if (!st.index) return false;
    if (st.paged) return pageOfOffset(off) === st.page;
    const r = rangeAt(off, Math.min(off + 1, st.index.total));
    if (!r) return false;
    const rect = firstRect(r);
    const vr = viewport.getBoundingClientRect();
    return st.vertical ? rect.right <= vr.right + 2 && rect.left >= vr.left - 2 : rect.top >= vr.top - 2 && rect.bottom <= vr.bottom + 2;
  }

  return {
    st,
    open,
    render,
    next,
    prev,
    goTo,
    relayout,
    applySettings,
    position,
    sectionRatio,
    selectionOffsets,
    textBetween,
    speechChunks,
    ensureVisible,
    setHighlight,
    flash,
    isOffsetOnPage,
    rebuild: () => { buildIndex(); },
    paintHighlights: () => {
      for (const m of [...flow.querySelectorAll("mark.hl")]) {
        const parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        m.remove();
        parent.normalize();
      }
      buildIndex();
      paintHighlights();
    },
    emit,
  };
}
