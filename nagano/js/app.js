/* =========================================================
   信州まちしるべ - アプリ本体
   データは js/data.js（REGIONS / TOWNS）
   記録はすべて端末内（localStorage）に保存され、外部へ送信されません。
   ========================================================= */
(() => {
  "use strict";

  const KEY_VISIT = "shinshu-michishirube-visited-v1";
  const KEY_FAV = "shinshu-michishirube-fav-v1";
  const REGION_ORDER = REGIONS.map((r) => r.id);
  const REGION_MAP = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- 保存 ---------- */
  const load = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  };
  const save = (key, set) => {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch (e) {
      toast("保存できませんでした（ブラウザの設定をご確認ください）");
    }
  };

  const state = {
    visited: load(KEY_VISIT),
    fav: load(KEY_FAV),
    q: "",
    region: "",
    types: new Set(),
    eki: false,
    mus: false,
    favOnly: false,
    unvisited: false,
    sort: "region",
    sobaView: "soba",
    sheetList: [],
    sheetIndex: -1,
    today: null,
  };

  /* ---------- 小物 ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
  }
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtPop = (n) => n.toLocaleString("ja-JP");
  const townById = (id) => TOWNS.find((t) => t.id === id);

  /* ---------- 外部リンク ----------
     施設ごとの公式URLは移転・閉店で変わるため、
     地名を添えた地図検索／Web検索のリンクにしています。 */
  const cleanQ = (s) => String(s).replace(/（[^）]*）/g, " ").replace(/\s+/g, " ").trim();
  const mapsLink = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(cleanQ(q));
  const webLink = (q) => "https://www.google.com/search?q=" + encodeURIComponent(cleanQ(q));
  const linkRow = (mapQ, webQ, mapLabel = "地図", webLabel = "検索") => `
    <div class="item-links">
      <a class="ilink map" href="${mapsLink(mapQ)}" target="_blank" rel="noopener">🗺 ${esc(mapLabel)}</a>
      <a class="ilink web" href="${webLink(webQ)}" target="_blank" rel="noopener">🔎 ${esc(webLabel)}</a>
    </div>`;

  /* ---------- 検索用インデックス ---------- */
  TOWNS.forEach((t) => {
    t._search = [
      t.n, t.k, t.t, REGION_MAP[t.r].name, t.c, t.charm, t.p,
      t.m.join(" "),
      t.s.map((x) => x[0] + " " + x[1]).join(" "),
      t.shop.map((x) => x[0] + " " + x[1]).join(" "),
      t.mus.map((x) => x[0] + " " + x[1]).join(" "),
      t.eki.join(" "),
      t.soba[0] + " " + t.soba[1],
      t.kg.join(" "),
      t.kgt,
    ].join(" ").toLowerCase();
    t._regionIndex = REGION_ORDER.indexOf(t.r);
  });

  /* ---------- しぼり込み ---------- */
  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = TOWNS.filter((t) => {
      if (q && !t._search.includes(q)) return false;
      if (state.region && t.r !== state.region) return false;
      if (state.types.size && !state.types.has(t.t)) return false;
      if (state.eki && t.eki.length === 0) return false;
      if (state.mus && t.mus.length === 0) return false;
      if (state.favOnly && !state.fav.has(t.id)) return false;
      if (state.unvisited && state.visited.has(t.id)) return false;
      return true;
    });
    const cmp = {
      region: (a, b) => a._regionIndex - b._regionIndex || a.k.localeCompare(b.k, "ja"),
      kana: (a, b) => a.k.localeCompare(b.k, "ja"),
      popDesc: (a, b) => b.pop - a.pop,
      popAsc: (a, b) => a.pop - b.pop,
      areaDesc: (a, b) => b.area - a.area,
      areaAsc: (a, b) => a.area - b.area,
    }[state.sort];
    return list.sort(cmp);
  }

  /* ---------- 一覧 ---------- */
  function townCard(t) {
    const tags = t.m
      .filter((m) => !t.soba[0].includes(m) && !m.includes(t.soba[0]))
      .slice(0, 3)
      .map((m) => `<span class="tag">${esc(m)}</span>`)
      .join("");
    const sobaTag = `<span class="tag soba">🍜 ${esc(t.soba[0])}</span>`;
    const kgTag = `<span class="tag kigashitsu">👥 ${esc(t.kg[0])}</span>`;
    const ekiBadge = t.eki.length ? `<span class="badge eki">道の駅 ${t.eki.length}</span>` : "";
    const musBadge = t.mus.length ? `<span class="badge mus">🖼 ${t.mus.length}</span>` : "";
    const fav = state.fav.has(t.id);
    const visited = state.visited.has(t.id);
    return `
      <div class="town-card${visited ? " visited" : ""}" style="border-left-color:rgb(var(--${t.t === "市" ? "indigo" : t.t === "町" ? "matcha" : "gold"}))">
        <button class="tc-open" data-id="${t.id}" style="all:unset;display:block;cursor:pointer;width:100%">
          <div class="tc-head">
            <span class="tc-name">${esc(t.n)}</span>
            <span class="tc-kana">${esc(t.k)}</span>
            <span class="tc-badges">
              ${musBadge}
              ${ekiBadge}
              <span class="badge region">${esc(REGION_MAP[t.r].name)}</span>
              <span class="badge type-${t.t}">${t.t}</span>
            </span>
          </div>
          <div class="tc-catch">${visited ? "🚩 " : ""}${esc(t.c)}</div>
          <div class="tc-tags">${sobaTag}${kgTag}${tags}</div>
        </button>
        <button class="tc-star${fav ? " on" : ""}" data-fav="${t.id}" aria-label="${esc(t.n)}をお気に入り">${fav ? "⭐" : "☆"}</button>
      </div>`;
  }

  function renderList() {
    const list = filtered();
    $("#listCount").textContent = `${list.length}市町村`;
    $("#townList").innerHTML = list.length
      ? list.map(townCard).join("")
      : `<div class="empty">条件に合う市町村が見つかりませんでした。<br />検索の言葉やしぼり込みを変えてみてください。</div>`;
    state.sheetList = list.map((t) => t.id);
  }

  /* ---------- 地域チップ ---------- */
  function renderRegionChips() {
    const wrap = $("#regionChips");
    const counts = REGIONS.map((r) => TOWNS.filter((t) => t.r === r.id).length);
    wrap.innerHTML =
      `<button class="chip${state.region === "" ? " on" : ""}" data-region="">全県（77）</button>` +
      REGIONS.map(
        (r, i) =>
          `<button class="chip${state.region === r.id ? " on" : ""}" data-region="${r.id}">${r.emoji} ${esc(r.name)}（${counts[i]}）</button>`
      ).join("");
  }

  /* ---------- 地域タブ ---------- */
  function renderRegionTab() {
    $("#regionGrid").innerHTML = REGIONS.map((r) => {
      const list = TOWNS.filter((t) => t.r === r.id);
      const done = list.filter((t) => state.visited.has(t.id)).length;
      return `
        <button class="region-card" data-gotoregion="${r.id}">
          <div class="rc-top">
            <span class="rc-emoji">${r.emoji}</span>
            <span class="rc-name">${esc(r.name)}</span>
            <span class="rc-count">${done}/${list.length}</span>
          </div>
          <div class="rc-desc">${esc(r.desc)}</div>
          <div class="bar"><i style="width:${(done / list.length) * 100}%"></i></div>
        </button>`;
    }).join("");

    const pop = TOWNS.reduce((a, t) => a + t.pop, 0);
    const area = TOWNS.reduce((a, t) => a + t.area, 0);
    const eki = TOWNS.reduce((a, t) => a + t.eki.length, 0);
    const ekiTowns = TOWNS.filter((t) => t.eki.length).length;
    $("#prefStats").innerHTML = [
      ["77", "市町村（全国最多）"],
      ["35", "村の数（全国最多）"],
      [fmtPop(pop), "おおよその人口"],
      [Math.round(area).toLocaleString(), "面積 km²（全国4位）"],
      [String(eki), "道の駅の数"],
      [String(TOWNS.reduce((a, t) => a + t.mus.length, 0)), "美術館・博物館"],
      [`${ekiTowns}/77`, "道の駅がある市町村"],
    ]
      .map(([b, s]) => `<div class="stat-box"><b>${b}</b><span>${s}</span></div>`)
      .join("");
  }

  /* ---------- そば・道の駅タブ ---------- */
  function renderSobaTab() {
    const root = $("#sobaView");
    if (state.sobaView === "soba") {
      const groups = REGIONS.map((r) => {
        const items = TOWNS.filter((t) => t.r === r.id)
          .sort((a, b) => a.k.localeCompare(b.k, "ja"))
          .map(
            (t) => `
            <div class="soba-item">
              <div>
                <span class="soba-name">${esc(t.soba[0])}</span>
                <span class="soba-town">${esc(t.n)}</span>
              </div>
              <div class="soba-desc">${esc(t.soba[1])}</div>
              <button class="link-btn" data-id="${t.id}">${esc(t.n)}のページを見る →</button>
            </div>`
          )
          .join("");
        return `<h2 class="sec-title">${r.emoji} ${esc(r.name)}</h2><div class="card">${items}</div>`;
      }).join("");
      root.innerHTML = `
        <div class="card">
          <p class="tiny" style="margin:0">長野県はそば処。県内どこにでもそば屋はありますが、土地ごとに「つゆ」「つなぎ」「食べ方」が違います。全77市町村ぶんの、その土地のそばをまとめました。</p>
        </div>${groups}`;
      return;
    }

    if (state.sobaView === "eki") {
      const has = TOWNS.filter((t) => t.eki.length).sort(
        (a, b) => a._regionIndex - b._regionIndex || a.k.localeCompare(b.k, "ja")
      );
      const none = TOWNS.filter((t) => !t.eki.length).sort(
        (a, b) => a._regionIndex - b._regionIndex || a.k.localeCompare(b.k, "ja")
      );
      const total = has.reduce((a, t) => a + t.eki.length, 0);
      root.innerHTML = `
        <div class="card">
          <p class="tiny" style="margin:0">このアプリに収録した道の駅は<b>${total}駅</b>、ある市町村は<b>${has.length}</b>、ない市町村は<b>${none.length}</b>です。新規開駅・休業があるため、お出かけ前に最新情報をご確認ください。</p>
        </div>
        <h2 class="sec-title">道の駅がある市町村</h2>
        <div class="card">
          ${has
            .map(
              (t) => `
            <div class="eki-item">
              <div class="eki-name">${esc(t.n)} <span class="badge region">${esc(REGION_MAP[t.r].name)}</span></div>
              <div class="soba-desc">${t.eki.map((e) => "🚗 " + esc(e)).join("<br />")}</div>
              <button class="link-btn" data-id="${t.id}">${esc(t.n)}のページを見る →</button>
            </div>`
            )
            .join("")}
        </div>
        <h2 class="sec-title">道の駅がない市町村</h2>
        <div class="card">
          <div class="tc-tags">${none
            .map((t) => `<button class="tag" style="border:0;cursor:pointer;font:inherit;font-size:.72rem" data-id="${t.id}">${esc(t.n)}</button>`)
            .join("")}</div>
          <p class="tiny" style="margin-top:8px">道の駅がなくても、直売所・農産物マルシェ・日帰り温泉が旅の休憩地になる市町村がたくさんあります。</p>
        </div>`;
      return;
    }

    if (state.sobaView === "mus") {
      const has = TOWNS.filter((t) => t.mus.length).sort(
        (a, b) => a._regionIndex - b._regionIndex || a.k.localeCompare(b.k, "ja")
      );
      const none = TOWNS.filter((t) => !t.mus.length).sort(
        (a, b) => a._regionIndex - b._regionIndex || a.k.localeCompare(b.k, "ja")
      );
      const total = has.reduce((a, t) => a + t.mus.length, 0);
      root.innerHTML = `
        <div class="card">
          <p class="tiny" style="margin:0">このアプリに収録した美術館・博物館は<b>${total}館</b>、ある市町村は<b>${has.length}</b>です。県立美術館から村立の資料館、企業や個人の私設館まで、信州は館の多い土地です。</p>
        </div>
        <h2 class="sec-title">美術館・博物館がある市町村</h2>
        <div class="card">
          ${has
            .map(
              (t) => `
            <div class="eki-item">
              <div class="eki-name">${esc(t.n)} <span class="badge region">${esc(REGION_MAP[t.r].name)}</span></div>
              <div class="soba-desc">${t.mus.map((m) => "🖼 " + esc(m[0])).join("<br />")}</div>
              <button class="link-btn" data-id="${t.id}">${esc(t.n)}のページを見る →</button>
            </div>`
            )
            .join("")}
        </div>
        <h2 class="sec-title">アプリに収録のない市町村</h2>
        <div class="card">
          <div class="tc-tags">${none
            .map((t) => `<button class="tag" style="border:0;cursor:pointer;font:inherit;font-size:.72rem" data-id="${t.id}">${esc(t.n)}</button>`)
            .join("")}</div>
          <p class="tiny" style="margin-top:8px">小さな郷土資料館や公民館の展示室がある場合もあります。各ページの「館をさがす」から探せます。</p>
        </div>`;
      return;
    }

    // 名物さがし
    const index = new Map();
    TOWNS.forEach((t) => t.m.forEach((m) => {
      const key = m.replace(/（.*?）/g, "").trim();
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(t);
    }));
    const groups = [...index.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ja"));
    const multi = groups.filter((g) => g[1].length > 1);
    const single = groups.filter((g) => g[1].length === 1);
    root.innerHTML = `
      <div class="card">
        <p class="tiny" style="margin:0">収録した名物は全部で<b>${groups.length}種類</b>。同じ名物を持つ市町村どうしを並べました。名前をタップすると、その市町村のページが開きます。</p>
      </div>
      <h2 class="sec-title">いくつもの市町村にある名物</h2>
      <div class="card">
        ${multi
          .map(
            (g) => `
          <div class="soba-item">
            <div><span class="soba-name">${esc(g[0])}</span><span class="soba-town">${g[1].length}市町村</span></div>
            <div class="tc-tags" style="margin-top:4px">${g[1]
              .map((t) => `<button class="tag" style="border:0;cursor:pointer;font:inherit;font-size:.7rem" data-id="${t.id}">${esc(t.n)}</button>`)
              .join("")}</div>
          </div>`
          )
          .join("")}
      </div>
      <h2 class="sec-title">その市町村だけの名物</h2>
      <div class="card">
        ${single
          .map(
            (g) =>
              `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px dashed rgba(var(--line),1)">
                 <span style="flex:1;font-size:.84rem">${esc(g[0])}</span>
                 <button class="link-btn" data-id="${g[1][0].id}">${esc(g[1][0].n)}</button>
               </div>`
          )
          .join("")}
      </div>`;
  }

  /* ---------- 記録タブ ---------- */
  function renderLogTab() {
    const v = state.visited.size;
    $("#visitedNum").textContent = v;
    const ring = $("#progRing");
    ring.style.strokeDashoffset = String(264 - (264 * v) / TOWNS.length);
    const msgs = [
      "気になる市町村を開いて「行った」を押すと記録されます。",
      "旅がはじまりました。次はどこへ。",
      "信州の半分近くまで来ました。",
      "77市町村の半分を突破。ここからが面白いところ。",
      "あと少しで全県制覇。村がいくつ残っているか見てみましょう。",
      "77市町村すべて制覇。おめでとうございます！",
    ];
    const idx = v === 0 ? 0 : v === TOWNS.length ? 5 : v < 10 ? 1 : v < 39 ? 2 : v < 60 ? 3 : 4;
    $("#progMsg").textContent = msgs[idx];

    $("#statFav").textContent = state.fav.size;
    $("#statEki").textContent = TOWNS.filter((t) => t.eki.length && state.visited.has(t.id)).length;
    $("#statRegion").textContent = REGIONS.filter((r) => {
      const list = TOWNS.filter((t) => t.r === r.id);
      return list.length && list.every((t) => state.visited.has(t.id));
    }).length;

    $("#regionProgress").innerHTML = REGIONS.map((r) => {
      const list = TOWNS.filter((t) => t.r === r.id);
      const done = list.filter((t) => state.visited.has(t.id)).length;
      return `
        <div class="rp-row">
          <div class="rp-label"><span>${r.emoji} ${esc(r.name)}</span><span class="muted">${done} / ${list.length}</span></div>
          <div class="bar"><i style="width:${(done / list.length) * 100}%"></i></div>
        </div>`;
    }).join("");

    const visited = TOWNS.filter((t) => state.visited.has(t.id)).sort(
      (a, b) => a._regionIndex - b._regionIndex || a.k.localeCompare(b.k, "ja")
    );
    $("#visitedList").innerHTML = visited.length
      ? `<div class="tc-tags">${visited
          .map(
            (t) =>
              `<button class="tag" style="border:0;cursor:pointer;font:inherit;font-size:.76rem;background:rgba(var(--matcha),.18)" data-id="${t.id}">🚩 ${esc(t.n)}</button>`
          )
          .join("")}</div>`
      : `<div class="empty" style="padding:18px">まだ記録がありません。<br />訪れた市町村のページで「行った」を押してみてください。</div>`;

    if (!state.today) pickToday();
    renderToday();
  }

  function pickToday() {
    const pool = TOWNS.filter((t) => !state.visited.has(t.id));
    const src = pool.length ? pool : TOWNS;
    state.today = src[Math.floor(Math.random() * src.length)].id;
  }
  function renderToday() {
    const t = townById(state.today);
    if (!t) return;
    $("#todayName").textContent = t.n;
    $("#todayCatch").textContent = `${REGION_MAP[t.r].name}地域 ／ ${t.c}`;
  }

  /* ---------- 詳細シート ---------- */
  function openSheet(id) {
    let idx = state.sheetList.indexOf(id);
    if (idx < 0) {
      state.sheetList = filtered().map((t) => t.id);
      idx = state.sheetList.indexOf(id);
      if (idx < 0) {
        state.sheetList = [id];
        idx = 0;
      }
    }
    state.sheetIndex = idx;
    renderSheet();
  }

  function renderSheet() {
    const t = townById(state.sheetList[state.sheetIndex]);
    if (!t) return;
    const r = REGION_MAP[t.r];
    const visited = state.visited.has(t.id);
    const fav = state.fav.has(t.id);
    const mapUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("長野県" + t.n);
    const siteUrl = "https://www.google.com/search?q=" + encodeURIComponent("長野県 " + t.n + " 公式サイト");

    $("#sheetRoot").innerHTML = `
      <div class="sheet-scrim" data-close="1"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(t.n)}の情報">
        <div class="sheet-head">
          <div class="sh-main">
            <div class="tiny">${r.emoji} ${esc(r.name)}地域 ／ ${esc(t.k)}</div>
            <h3>${esc(t.n)}</h3>
            <div class="tiny">${esc(t.c)}</div>
            <div class="d-facts">
              <span class="fact">人口 約${fmtPop(t.pop)}人</span>
              <span class="fact">面積 ${t.area}km²</span>
              <span class="fact">${t.eki.length ? "道の駅 " + t.eki.length + "駅" : "道の駅なし"}</span>
              ${t.mus.length ? `<span class="fact">美術館・博物館 ${t.mus.length}館</span>` : ""}
            </div>
          </div>
          <button class="icon-btn" data-close="1" aria-label="閉じる">✕</button>
        </div>

        <div class="sheet-body">
          <div class="act-row">
            <button class="btn ${visited ? "green" : ""}" data-toggle-visit="${t.id}">${visited ? "🚩 行った" : "🚩 行ったことにする"}</button>
            <button class="btn ${fav ? "primary" : ""}" data-toggle-fav="${t.id}">${fav ? "⭐ お気に入り" : "☆ お気に入り"}</button>
          </div>

          <div class="d-sec">
            <h4>✨ この土地の魅力</h4>
            <p>${esc(t.charm)}</p>
          </div>

          <div class="d-sec">
            <h4>🍎 名物・特産</h4>
            <div class="meibutsu-row">${t.m.map((m) => `<span class="meibutsu">${esc(m)}</span>`).join("")}</div>
          </div>

          <div class="d-sec">
            <h4>⛩️ 観光スポット</h4>
            <ul class="d-list">
              ${t.s
                .map(
                  (x) => `<li>
                    <div class="dl-name">${esc(x[0])}</div>
                    <div class="dl-desc">${esc(x[1])}</div>
                    ${linkRow(`${t.n} ${x[0]}`, `長野県 ${t.n} ${x[0]}`)}
                  </li>`
                )
                .join("")}
            </ul>
          </div>

          <div class="d-sec">
            <h4>🖼 美術館・博物館</h4>
            ${
              t.mus.length
                ? `<ul class="d-list">
                     ${t.mus
                       .map(
                         (x) => `<li>
                           <div class="dl-name">${esc(x[0])}</div>
                           <div class="dl-desc">${esc(x[1])}</div>
                           ${linkRow(`${t.n} ${x[0]}`, `長野県 ${t.n} ${x[0]}`)}
                         </li>`
                       )
                       .join("")}
                   </ul>`
                : `<div class="mus-empty">
                     <b>このアプリには収録がありません</b>
                     <div class="tiny" style="margin-top:4px">小さな郷土資料館や公民館の展示室がある場合もあります。下のリンクから探せます。</div>
                     ${linkRow(`${t.n} 資料館`, `長野県 ${t.n} 美術館 博物館 資料館`, "近くの資料館", "館をさがす")}
                   </div>`
            }
          </div>

          ${
            t.shop.length
              ? `<div class="d-sec">
                   <h4>🛍️ お店・立ち寄りどころ</h4>
                   <ul class="d-list">
                     ${t.shop
                       .map(
                         (x) => `<li>
                           <div class="dl-name">${esc(x[0])}</div>
                           <div class="dl-desc">${esc(x[1])}</div>
                           ${linkRow(`${t.n} ${x[0]}`, `長野県 ${t.n} ${x[0]}`)}
                         </li>`
                       )
                       .join("")}
                   </ul>
                 </div>`
              : ""
          }

          <div class="d-sec">
            <h4>🚗 道の駅</h4>
            <div class="eki-box">
              ${
                t.eki.length
                  ? `<b>${t.eki.length}駅あります</b>
                     <ul class="eki-list">
                       ${t.eki
                         .map(
                           (e) => `<li>
                             <span class="eki-li-name">${esc(e)}</span>
                             ${linkRow(`長野県 ${e}`, `長野県 ${e}`)}
                           </li>`
                         )
                         .join("")}
                     </ul>`
                  : `<b>道の駅はありません</b>
                     <div class="tiny" style="margin-top:4px">直売所や日帰り温泉が休憩どころになります。</div>
                     ${linkRow(`${t.n} 農産物直売所`, `長野県 ${t.n} 直売所 日帰り温泉`, "近くの直売所", "休憩どころ")}`
              }
            </div>
          </div>

          <div class="d-sec">
            <h4>🍜 ご当地そば</h4>
            <div class="soba-box">
              <div class="soba-name" style="font-size:1rem">${esc(t.soba[0])}</div>
              <div class="soba-desc" style="margin-top:4px">${esc(t.soba[1])}</div>
              ${linkRow(`${t.n} そば`, `${t.soba[0]} ${t.n}`, "そば店をさがす", `${t.soba[0]}を調べる`)}
            </div>
          </div>

          <div class="d-sec">
            <h4>🧑‍🤝‍🧑 住民の人柄</h4>
            <div class="kigashitsu-box">
              <div class="kg-tags">${t.kg.map((k) => `<span class="kg-tag">${esc(k)}</span>`).join("")}</div>
              <p style="margin-top:7px">${esc(t.kgt)}</p>
              <p class="tiny" style="margin-top:7px">※ その土地でよく語られる気質の傾向です。一人ひとりに当てはまるものではありません。</p>
            </div>
          </div>

          <div class="d-sec">
            <h4>👥 住民と土地の特徴</h4>
            <p>${esc(t.p)}</p>
          </div>

          <div class="ext-links">
            <a href="${mapUrl}" target="_blank" rel="noopener">🗺 地図で見る</a>
            <a href="${siteUrl}" target="_blank" rel="noopener">🔎 公式サイトを探す</a>
          </div>
          <p class="tiny" style="margin-top:12px">※ 施設の営業状況やイベントの開催は変わることがあります。お出かけ前に公式情報でご確認ください。</p>
        </div>

        <div class="sheet-nav">
          <button class="btn" data-step="-1" ${state.sheetIndex === 0 ? "disabled" : ""}>← 前</button>
          <button class="btn" data-close="1">閉じる</button>
          <button class="btn" data-step="1" ${state.sheetIndex === state.sheetList.length - 1 ? "disabled" : ""}>次 →</button>
        </div>
      </section>`;
    document.body.style.overflow = "hidden";
  }

  function closeSheet() {
    $("#sheetRoot").innerHTML = "";
    document.body.style.overflow = "";
  }

  /* ---------- お気に入り・訪問 ---------- */
  function toggleFav(id) {
    if (state.fav.has(id)) {
      state.fav.delete(id);
      toast("お気に入りから外しました");
    } else {
      state.fav.add(id);
      toast(`${townById(id).n}をお気に入りに追加`);
    }
    save(KEY_FAV, state.fav);
    refreshAll();
  }
  function toggleVisit(id) {
    if (state.visited.has(id)) {
      state.visited.delete(id);
      toast("記録を取り消しました");
    } else {
      state.visited.add(id);
      const n = state.visited.size;
      toast(n === TOWNS.length ? "🎉 77市町村すべて制覇！" : `${townById(id).n}を記録（${n}/77）`);
    }
    save(KEY_VISIT, state.visited);
    refreshAll();
  }

  function refreshAll() {
    renderList();
    renderRegionTab();
    renderLogTab();
    if ($(".sheet")) renderSheet();
  }

  /* ---------- モーダル ---------- */
  function openModal(html) {
    $("#modalRoot").innerHTML = `
      <div class="modal-scrim" data-modalclose="1">
        <div class="modal" role="dialog" aria-modal="true">
          ${html}
          <button class="btn block primary" data-modalclose="1" style="margin-top:12px">閉じる</button>
        </div>
      </div>`;
  }
  const closeModal = () => ($("#modalRoot").innerHTML = "");

  const HOWTO = `
    <h3>このアプリの使い方</h3>
    <ul>
      <li><b>一覧</b>：市町村名・名物・そば・観光地の名前で検索できます。地域や「市／町／村」、「道の駅あり」でしぼり込みも。</li>
      <li><b>市町村カード</b>をタップすると、魅力・名物・観光・美術館と博物館・お店・道の駅・ご当地そば・住民の人柄・土地の特徴が開きます。観光スポット・お店・道の駅・そばには、それぞれ「🗺 地図」「🔎 検索」のリンクが付いています。シート下の「前／次」で隣の市町村へ移動できます。</li>
      <li><b>地域</b>：長野県の10の広域圏から探せます。</li>
      <li><b>そば・道の駅</b>：全77市町村のご当地そば一覧、道の駅の一覧（ある／ない）、美術館・博物館の一覧、名物から探す一覧を切り替えられます。</li>
      <li><b>記録</b>：訪れた市町村に「行った」を付けると、77市町村の制覇ぐあいが記録されます。「きょうの一市町村」は、まだ行っていない町から選ばれます。</li>
    </ul>
    <p>記録は端末の中だけに保存されます。サーバーには何も送信されません。</p>`;

  function statsHtml() {
    const pop = TOWNS.reduce((a, t) => a + t.pop, 0);
    const area = TOWNS.reduce((a, t) => a + t.area, 0);
    const eki = TOWNS.reduce((a, t) => a + t.eki.length, 0);
    const mus = TOWNS.reduce((a, t) => a + t.mus.length, 0);
    const big = [...TOWNS].sort((a, b) => b.pop - a.pop).slice(0, 3);
    const small = [...TOWNS].sort((a, b) => a.pop - b.pop).slice(0, 3);
    const wide = [...TOWNS].sort((a, b) => b.area - a.area).slice(0, 3);
    return `
      <h3>長野県のまとめ数字</h3>
      <ul>
        <li>市町村の数：<b>77</b>（19市・23町・35村）。市町村数・村の数ともに全国最多です。</li>
        <li>面積：約<b>${Math.round(area).toLocaleString()}km²</b>（全国4位の広さ）。</li>
        <li>人口：約<b>${fmtPop(pop)}人</b>（このアプリの収録値の合計）。</li>
        <li>収録した道の駅：<b>${eki}駅</b>。</li>
        <li>収録した美術館・博物館：<b>${mus}館</b>（${TOWNS.filter((t) => t.mus.length).length}市町村）。</li>
        <li>人口の多い順：${big.map((t) => t.n).join("・")}</li>
        <li>人口の少ない順：${small.map((t) => t.n).join("・")}</li>
        <li>面積の広い順：${wide.map((t) => t.n).join("・")}</li>
        <li>隣接する県は<b>8つ</b>（新潟・群馬・埼玉・山梨・静岡・愛知・岐阜・富山）で、これも全国最多です。</li>
      </ul>`;
  }

  const ABOUT = `
    <h3>出典と免責について</h3>
    <p>このアプリの内容は、長野県内の各市町村の一般に知られた特徴・名物・観光資源をまとめた読みものです。人口はおおむね2020年国勢調査の水準、面積は概数で、いずれも「だいたいの規模感」をつかむための目安としてご覧ください。</p>
    <p>道の駅・お店・イベントは、新規開業や休業、季節・曜日による営業の変更があります。<b>お出かけの前に、各市町村や施設の公式情報で必ずご確認ください。</b></p>
    <p>登山・秘湯・火山周辺（御嶽山など）へ向かうときは、最新の気象・火山・道路情報の確認をお願いします。</p>
    <p>「住民の人柄」は、その土地の歴史や産業から一般に語られる気質の傾向をまとめたものです。個々の住民を評価するものではなく、一人ひとりに当てはまるものでもありません。</p>
    <p>各項目の「🗺 地図」「🔎 検索」は、施設ごとの公式URLが移転や閉店で変わることを避けるため、地名を添えた地図検索・Web検索を開くようにしています。</p>
    <p>本アプリは無料で、広告・登録・課金はありません。入力した記録は端末内にのみ保存され、外部へ送信されることはありません。</p>`;

  /* ---------- イベント ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-id],[data-fav],[data-region],[data-gotoregion],[data-filter],[data-view],[data-tab],[data-close],[data-step],[data-toggle-visit],[data-toggle-fav],[data-action],[data-modalclose]");
    if (!el) return;

    if (el.dataset.modalclose) return closeModal();
    if (el.dataset.close) return closeSheet();

    if (el.dataset.step) {
      const next = state.sheetIndex + Number(el.dataset.step);
      if (next >= 0 && next < state.sheetList.length) {
        state.sheetIndex = next;
        renderSheet();
        $(".sheet-body").scrollTop = 0;
      }
      return;
    }
    if (el.dataset.toggleVisit) return toggleVisit(el.dataset.toggleVisit);
    if (el.dataset.toggleFav) return toggleFav(el.dataset.toggleFav);
    if (el.dataset.fav) return toggleFav(el.dataset.fav);
    if (el.dataset.id) return openSheet(el.dataset.id);

    if (el.dataset.region !== undefined && el.hasAttribute("data-region")) {
      state.region = el.dataset.region;
      renderRegionChips();
      renderList();
      return;
    }
    if (el.dataset.gotoregion) {
      state.region = el.dataset.gotoregion;
      state.q = "";
      $("#searchInput").value = "";
      $("#searchClear").hidden = true;
      renderRegionChips();
      renderList();
      switchTab("list");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (el.dataset.filter) {
      const f = el.dataset.filter;
      if (f === "type") {
        const v = el.dataset.value;
        state.types.has(v) ? state.types.delete(v) : state.types.add(v);
        el.classList.toggle("on", state.types.has(v));
        el.classList.toggle("green", true);
      } else if (f === "eki") {
        state.eki = !state.eki;
        el.classList.toggle("on", state.eki);
        el.classList.add("apple");
      } else if (f === "mus") {
        state.mus = !state.mus;
        el.classList.toggle("on", state.mus);
        el.classList.add("gold");
      } else if (f === "fav") {
        state.favOnly = !state.favOnly;
        el.classList.toggle("on", state.favOnly);
        el.classList.add("gold");
      } else if (f === "unvisited") {
        state.unvisited = !state.unvisited;
        el.classList.toggle("on", state.unvisited);
      }
      renderList();
      return;
    }
    if (el.dataset.view) {
      state.sobaView = el.dataset.view;
      $$("#sobaTabChips .chip").forEach((c) => c.classList.toggle("on", c === el));
      $$("#sobaTabChips .chip").forEach((c) => c.classList.toggle("green", c === el));
      renderSobaTab();
      window.scrollTo({ top: 0 });
      return;
    }
    if (el.dataset.tab) return switchTab(el.dataset.tab);

    if (el.dataset.action) {
      closeMenu();
      const a = el.dataset.action;
      if (a === "howto") openModal(HOWTO);
      else if (a === "stats") openModal(statsHtml());
      else if (a === "about") openModal(ABOUT);
      else if (a === "install") doInstall();
      else if (a === "reset") {
        if (confirm("「行った」記録とお気に入りをすべて消します。よろしいですか？")) {
          state.visited.clear();
          state.fav.clear();
          save(KEY_VISIT, state.visited);
          save(KEY_FAV, state.fav);
          refreshAll();
          toast("記録を消しました");
        }
      }
    }
  });

  function switchTab(name) {
    $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
    if (name === "soba" && !$("#sobaView").innerHTML) renderSobaTab();
    if (name === "log") renderLogTab();
    if (name === "region") renderRegionTab();
    window.scrollTo({ top: 0 });
  }

  /* 検索 */
  const searchInput = $("#searchInput");
  searchInput.addEventListener("input", () => {
    state.q = searchInput.value;
    $("#searchClear").hidden = !searchInput.value;
    renderList();
  });
  $("#searchClear").addEventListener("click", () => {
    searchInput.value = "";
    state.q = "";
    $("#searchClear").hidden = true;
    renderList();
    searchInput.focus();
  });
  $("#sortSelect").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderList();
  });

  /* きょうの一市町村 */
  $("#todayShuffle").addEventListener("click", () => {
    pickToday();
    renderToday();
  });
  $("#todayOpen").addEventListener("click", () => {
    state.sheetList = TOWNS.map((t) => t.id);
    openSheet(state.today);
  });

  /* メニュー */
  const menuBtn = $("#menuBtn"),
    menuPanel = $("#menuPanel"),
    menuScrim = $("#menuScrim");
  function closeMenu() {
    menuPanel.hidden = true;
    menuScrim.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", () => {
    const open = menuPanel.hidden;
    menuPanel.hidden = !open;
    menuScrim.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  menuScrim.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($(".modal")) closeModal();
      else if ($(".sheet")) closeSheet();
      else closeMenu();
    }
    if ($(".sheet")) {
      if (e.key === "ArrowRight") $('[data-step="1"]')?.click();
      if (e.key === "ArrowLeft") $('[data-step="-1"]')?.click();
    }
  });

  /* インストール */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("#installMenuItem").hidden = false;
  });
  function doInstall() {
    if (!deferredPrompt) {
      toast("ブラウザのメニューから「ホーム画面に追加」をお試しください");
      return;
    }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
      $("#installMenuItem").hidden = true;
    });
  }

  /* 起動 */
  renderRegionChips();
  renderList();
  renderRegionTab();
  renderLogTab();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
