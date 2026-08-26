/* ===========================================================
   うつし鏡 — 顔タイプごとの「このタイプの例」

   8つの顔タイプそれぞれに、そのタイプの雰囲気を思い浮かべやすくする
   名前を添えられます。ここに書いた名前は、アプリを開いた全員に表示されます。

   ■ これは「本人との照合」ではありません
     このアプリは顔の造作の比率からタイプを分けているだけで、
     特定の人物と顔を突き合わせているわけではありません。
     表示も「このタイプの例」として出しています。

   ■ 実在の人物名を載せるかどうかは、公開する人の判断です
     実在の芸能人・有名人の名前を商用アプリの機能に使う場合、
     パブリシティ権への配慮が必要になることがあります。
     初期状態では空にしてあります。載せる場合はご自身でご判断ください。

   ■ 書き方
     タイプの記号（key）ごとに、名前を文字列の配列で並べます。
       marumi: ["名前A", "名前B"],
     アプリの「しくみ」タブからも、この端末だけで使う名前を登録できます。
     そちらを登録すると、このファイルの内容より優先されます。
   =========================================================== */
(() => {
  "use strict";

  const defaults = {
    marumi: [],        // 桜色のまるみ
    hakuji: [],        // 白磁のたまご
    suzukaze: [],      // 涼風のきりり
    tsukishizuku: [],  // 月しずくの面長
    ai: [],            // 藍のかくばり
    kogiku: [],        // 小菊のこぶり
    ishidatami: [],    // 石畳のおおらか
    hamon: [],         // 刃紋のほそおもて
  };

  const STORE_KEY = "utsushi-kagami-examples-v1";

  /** この端末で登録した名前（あれば defaults より優先） */
  function local() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function save(map) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(map));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    try { localStorage.removeItem(STORE_KEY); } catch { /* 消せなくても支障はない */ }
  }

  /** タイプの記号に対応する名前の一覧を返す */
  function namesFor(key) {
    const store = local();
    const list = (store && store[key]) || defaults[key] || [];
    return Array.isArray(list) ? list.filter((n) => typeof n === "string" && n.trim()) : [];
  }

  /** 登録画面のために、全タイプの現在の登録内容を返す */
  function all() {
    const store = local();
    const out = {};
    Object.keys(defaults).forEach((key) => {
      const list = (store && store[key]) || defaults[key] || [];
      out[key] = Array.isArray(list) ? list.slice() : [];
    });
    return out;
  }

  window.KagamiExamples = { namesFor, all, save, clear, defaults, STORE_KEY };
})();
