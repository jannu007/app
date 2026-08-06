/* ===========================================================
   志野図鑑 — アプリロジック
   お気に入りの情報のみ端末内 (localStorage) に保存されます。
   =========================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "shino-zukan:v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- データストア（お気に入りのみ） ---------------- */
  const defaultData = () => ({ favorites: [] });

  const Store = {
    data: defaultData(),
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.data = { ...defaultData(), ...JSON.parse(raw) };
      } catch (e) {
        console.warn("読み込みに失敗しました", e);
      }
      if (!Array.isArray(this.data.favorites)) this.data.favorites = [];
    },
    save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); },
    toggleFavorite(id) {
      const i = this.data.favorites.indexOf(id);
      if (i === -1) this.data.favorites.push(id); else this.data.favorites.splice(i, 1);
      this.save();
      return this.data.favorites.includes(id);
    },
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

  /* ---------------- お気に入り対象のメタ情報 ---------------- */
  const FAV_META = {
    "type-mujishino": { label: "無地志野", tab: "feature", icon: "🎨" },
    "type-eshino": { label: "絵志野", tab: "feature", icon: "🎨" },
    "type-nezumishino": { label: "鼠志野", tab: "feature", icon: "🎨" },
    "type-benishino": { label: "紅志野・赤志野", tab: "feature", icon: "🎨" },
    "type-neriage": { label: "練上手", tab: "feature", icon: "🎨" },
    "piece-unohanagaki": { label: "志野茶碗 銘 卯花墻", tab: "gallery", icon: "🏺" },
    "piece-hirosawa": { label: "志野茶碗 銘 広沢", tab: "gallery", icon: "🏺" },
  };

  /* ---------------- 豆知識 ---------------- */
  const TRIVIA = [
    "「志野」という名前は、茶人・志野宗信にちなむと伝えられています（諸説あり）。",
    "志野焼は、日本で初めて陶器の全面に白い釉薬をかけた焼き物といわれています。",
    "志野焼は長らく瀬戸で焼かれたと考えられていましたが、1930年に荒川豊蔵が美濃・久々利の古窯跡で陶片を発見し、美濃産であることが明らかになりました。",
    "国宝に指定されている日本製の茶碗は、本阿弥光悦の「不二山」とこの志野茶碗「卯花墻」のわずか2碗だけといわれています。",
    "志野焼の白い釉薬は「長石釉」と呼ばれ、長石を主原料としています。",
    "志野焼に使われる「もぐさ土」は、艾（もぐさ）のようにざんぐりとした質感からその名がついたといわれています。",
    "志野の茶碗の縁に見られる赤い色は「火色（緋色）」と呼ばれ、釉薬の薄い部分に窯の炎が直接あたることで生まれます。",
    "鼠志野は、鉄を含む化粧土に文様を掻き落としてから白い釉薬をかけてつくられます。",
    "練上手は、白土と赤土を練り混ぜてつくるため、同じ模様は二つとできません。",
  ];
  let lastTriviaIdx = -1;
  function showRandomTrivia() {
    let idx;
    do { idx = Math.floor(Math.random() * TRIVIA.length); } while (idx === lastTriviaIdx && TRIVIA.length > 1);
    lastTriviaIdx = idx;
    $("#triviaText").textContent = TRIVIA[idx];
  }

  /* ---------------- お気に入り ---------------- */
  function renderFavButtons() {
    $$(".fav-btn").forEach((btn) => {
      const id = btn.dataset.favId;
      const active = Store.data.favorites.includes(id);
      btn.textContent = active ? "★" : "☆";
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-label", active ? "お気に入りから外す" : "お気に入りに追加");
    });
  }

  function renderFavoriteList() {
    const card = $("#favoriteCard");
    const list = $("#favoriteList");
    list.innerHTML = "";
    const favs = Store.data.favorites.filter((id) => FAV_META[id]);
    if (favs.length === 0) { card.hidden = true; return; }
    card.hidden = false;
    favs.forEach((id) => {
      const meta = FAV_META[id];
      const li = document.createElement("li");
      li.innerHTML = `<span>${meta.icon} ${meta.label}</span><span aria-hidden="true">→</span>`;
      li.addEventListener("click", () => switchTab(meta.tab));
      list.appendChild(li);
    });
  }

  document.addEventListener("click", (e) => {
    const favBtn = e.target.closest(".fav-btn");
    if (!favBtn) return;
    const id = favBtn.dataset.favId;
    const active = Store.toggleFavorite(id);
    renderFavButtons();
    renderFavoriteList();
    toast(active ? "お気に入りに追加しました" : "お気に入りから外しました");
  });

  /* ---------------- タブ切り替え ---------------- */
  function switchTab(name) {
    $$(".tab-btn[data-tab]").forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    $$(".tab-pane").forEach((pane) => { pane.hidden = pane.id !== `tab-${name}`; });
    $(".tab-content").scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  $$(".tab-btn[data-tab]").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $$(".nav-tile[data-tab]").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  /* ---------------- 豆知識ボタン ---------------- */
  $("#triviaNextBtn").addEventListener("click", showRandomTrivia);

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
    a.download = "shino-zukan-favorites.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("お気に入りを書き出しました");
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
        renderFavButtons();
        renderFavoriteList();
        toast("お気に入りを読み込みました");
      } catch (err) {
        toast("読み込みに失敗しました");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  function resetData() {
    if (!confirm("お気に入りをすべて削除します。よろしいですか？")) return;
    Store.data = defaultData();
    Store.save();
    renderFavButtons();
    renderFavoriteList();
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
    toast("インストールしました🏺");
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
  showRandomTrivia();
  renderFavButtons();
  renderFavoriteList();
})();
