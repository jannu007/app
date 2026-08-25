/* ===========================================================
   うつし鏡 — 顔立ち（顔タイプ）の判定

   顔の特徴点（ランドマーク）を MediaPipe Face Landmarker で取り出し、
   輪郭・目・鼻・口の比率から顔立ちのタイプを判定します。

   モデルとライブラリはこのアプリに同梱してあり、実行時に外部へ
   取りに行くことはありません。画像も端末内から出ません。
   （ライセンスは vendor/LICENSES.md を参照）
   =========================================================== */
(() => {
  "use strict";

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const ramp = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

  /* ---------------- モデルの読み込み ---------------- */

  let landmarkerPromise = null;

  /**
   * Face Landmarker を用意する。初回だけ読み込み、以後は使い回す。
   * 読み込めない環境（WebAssembly SIMD 非対応など）では null を返し、
   * 顔立ちの判定だけを省略する。肌の解析には影響しない。
   */
  function getLandmarker() {
    if (landmarkerPromise) return landmarkerPromise;
    landmarkerPromise = (async () => {
      const vision = await import("../vendor/mediapipe/vision_bundle.mjs");
      const fileset = await vision.FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
      return vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "./vendor/mediapipe/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    })().catch(() => null);
    return landmarkerPromise;
  }

  /* ---------------- 特徴点から比率を測る ---------------- */

  // Face Landmarker が返す 478 点のうち、使う点の番号
  const PT = {
    chin: 152,          // あご先
    foreheadTop: 10,    // 額の上端
    cheekL: 234,        // 左の頬骨の外側
    cheekR: 454,        // 右の頬骨の外側
    jawL: 172,          // 左のエラ
    jawR: 397,          // 右のエラ
    eyeLOuter: 33,      // 左目の目尻
    eyeLInner: 133,     // 左目の目頭
    eyeLTop: 159,
    eyeLBottom: 145,
    eyeROuter: 263,     // 右目の目尻
    eyeRInner: 362,
    eyeRTop: 386,
    eyeRBottom: 374,
    noseTip: 1,
    mouthL: 61,
    mouthR: 291,
    mouthTop: 13,
    mouthBottom: 14,
    browL: 105,
    browR: 334,
  };

  /**
   * 特徴点から、顔立ちの比率を求める。
   *
   * すべて「頬骨の幅」を 1 とした比率にするので、
   * 顔の大きさや写した距離が変わっても同じ値になる。
   * 縦横比の歪みを避けるため、画像の縦横比を掛けて実寸比に直している。
   */
  function measure(landmarks, aspect) {
    const p = (i) => ({ x: landmarks[i].x, y: landmarks[i].y * aspect });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    const cheekW = dist(p(PT.cheekL), p(PT.cheekR));
    if (!(cheekW > 0)) return null;

    const chin = p(PT.chin);
    const top = p(PT.foreheadTop);
    const eyeLc = { x: (p(PT.eyeLOuter).x + p(PT.eyeLInner).x) / 2, y: (p(PT.eyeLOuter).y + p(PT.eyeLInner).y) / 2 };
    const eyeRc = { x: (p(PT.eyeROuter).x + p(PT.eyeRInner).x) / 2, y: (p(PT.eyeROuter).y + p(PT.eyeRInner).y) / 2 };
    const eyeMid = { x: (eyeLc.x + eyeRc.x) / 2, y: (eyeLc.y + eyeRc.y) / 2 };

    const faceLen = dist(top, chin);
    const lowerFace = Math.abs(chin.y - eyeMid.y) / cheekW;   // 目からあご先 ÷ 頬幅
    const jawW = dist(p(PT.jawL), p(PT.jawR));

    const eyeW = (dist(p(PT.eyeLOuter), p(PT.eyeLInner)) + dist(p(PT.eyeROuter), p(PT.eyeRInner))) / 2;
    const eyeH = (dist(p(PT.eyeLTop), p(PT.eyeLBottom)) + dist(p(PT.eyeRTop), p(PT.eyeRBottom))) / 2;
    const eyeGap = dist(p(PT.eyeLInner), p(PT.eyeRInner));

    return {
      faceRatio: faceLen / cheekW,          // 顔の縦横比（大きいほど面長）
      lowerFace,                            // 目からあご先の長さ
      jawRatio: jawW / cheekW,              // エラの張り（大きいほど角張る）
      eyeOpenness: eyeH / eyeW,             // 目の丸さ（大きいほどぱっちり）
      eyeSize: eyeW / cheekW,               // 目の大きさ
      eyeGap: eyeGap / eyeW,                // 目の間隔（目の幅の何個ぶん離れているか）
      mouthWidth: dist(p(PT.mouthL), p(PT.mouthR)) / cheekW,
    };
  }

  /* ---------------- 顔タイプ ---------------- */

  /**
   * 3つの軸で顔立ちを位置づける。値はいずれも 0〜1。
   *   length : 0 = 丸顔・横広  ←→ 1 = 面長
   *   jaw    : 0 = あごシャープ ←→ 1 = エラ張り・丸み
   *   eye    : 0 = 切れ長       ←→ 1 = ぱっちり
   */
  const TYPES = [
    {
      key: "marumi", name: "桜色のまるみ", yomi: "さくらいろのまるみ", axes: [0.15, 0.7, 0.85],
      catch: "やわらかく、人なつこい顔立ち",
      impression: "丸みのある輪郭とぱっちりした目の組み合わせ。話しかけやすい空気をまとい、実年齢より若く見られることが多いタイプです。",
      strong: "笑顔がよく映えます。明るい色や丸みのある小物と相性がよい顔立ちです。",
    },
    {
      key: "hakuji", name: "白磁のたまご", yomi: "はくじのたまご", axes: [0.5, 0.5, 0.5],
      catch: "均整のとれた、端正な顔立ち",
      impression: "たまご型の輪郭で、目鼻立ちの配置が整っています。装いや髪型を選ばず、清潔感のある落ち着いた印象を与えるタイプです。",
      strong: "似合う幅が広い顔立ちです。前髪の有無で印象を大きく変えられます。",
    },
    {
      key: "suzukaze", name: "涼風のきりり", yomi: "すずかぜのきりり", axes: [0.8, 0.3, 0.15],
      catch: "涼しげで、大人びた顔立ち",
      impression: "縦に長い輪郭と切れ長の目。静かで理知的な印象を与え、実年齢より落ち着いて見られやすいタイプです。",
      strong: "直線的なデザインや、すっきりした髪型がよく似合います。",
    },
    {
      key: "tsukishizuku", name: "月しずくの面長", yomi: "つきしずくのおもなが", axes: [0.85, 0.65, 0.8],
      catch: "やさしく、儚げな顔立ち",
      impression: "縦の長さがありながら輪郭はやわらかく、目に丸みがあります。おっとりとした空気をまとうタイプです。",
      strong: "横に広がる髪型やイヤリングで、縦の長さがやわらぎます。",
    },
    {
      key: "ai", name: "藍のかくばり", yomi: "あいのかくばり", axes: [0.5, 0.95, 0.25],
      catch: "意志の強さがにじむ顔立ち",
      impression: "エラのあたりに幅があり、目はすっきり。芯の強さや頼りがいを感じさせるタイプです。",
      strong: "顔まわりに動きのある髪型だと、輪郭がやわらかく見えます。",
    },
    {
      key: "kogiku", name: "小菊のこぶり", yomi: "こぎくのこぶり", axes: [0.25, 0.2, 0.8],
      catch: "小づくりで、可憐な顔立ち",
      impression: "あごがすっと細く、目が大きめ。顔まわりが小さく見え、華奢な印象を持たれやすいタイプです。",
      strong: "小ぶりな造作が生きるので、装飾は少なめのほうが引き立ちます。",
    },
    {
      key: "ishidatami", name: "石畳のおおらか", yomi: "いしだたみのおおらか", axes: [0.2, 0.9, 0.55],
      catch: "安心感のある、おおらかな顔立ち",
      impression: "横に広がりのある輪郭で、どっしりとした安定感があります。実直で親しみやすい印象のタイプです。",
      strong: "縦のラインを作る髪型や襟元で、すっきりと見えます。",
    },
    {
      key: "hamon", name: "刃紋のほそおもて", yomi: "はもんのほそおもて", axes: [0.95, 0.15, 0.45],
      catch: "研ぎ澄まされた、細面の顔立ち",
      impression: "縦に長くあごが細い、いわゆる細面。シャープで洗練された印象を与えるタイプです。",
      strong: "シンプルな装いがよく映えます。頬に丸みを出すと表情が和らぎます。",
    },
  ];

  /** 計測値をタイプに当てはめる */
  function classify(m) {
    if (!m) return null;

    // 各軸の下限・上限は、正面から写した顔の一般的な比率の幅を目安にしている
    const axes = [
      ramp(m.faceRatio, 1.10, 1.55),     // 顔の縦横比
      ramp(m.jawRatio, 0.70, 0.95),      // エラの張り
      ramp(m.eyeOpenness, 0.25, 0.44),   // 目の丸さ
    ];

    const scored = TYPES.map((t) => {
      let d = 0;
      for (let i = 0; i < 3; i++) {
        const diff = axes[i] - t.axes[i];
        d += diff * diff;
      }
      return { type: t, distance: Math.sqrt(d) };
    }).sort((a, b) => a.distance - b.distance);

    const best = scored[0], second = scored[1];
    const match = clamp(Math.round((1 - best.distance / Math.sqrt(3)) * 100), 45, 99);

    return {
      key: best.type.key,
      name: best.type.name,
      yomi: best.type.yomi,
      catch: best.type.catch,
      impression: best.type.impression,
      strong: best.type.strong,
      match,
      near: second.distance - best.distance < 0.16 ? second.type.name : null,
      axes: { length: axes[0], jaw: axes[1], eye: axes[2] },
      measures: m,
    };
  }

  /**
   * 計測値を、そのまま読める形にする。
   *
   * 「標準の目安」は、正面から写した顔でよく見られるおおよその幅であって、
   * 良し悪しを表すものではない。断定を避けるため、その幅に収まっていれば
   * 「標準的」とだけ書き、外れているときにどちら寄りかを添える。
   */
  const REFERENCE = {
    faceRatio: { lo: 1.20, hi: 1.45, low: "丸顔寄り", high: "面長寄り" },
    jawRatio: { lo: 0.74, hi: 0.90, low: "細くシャープ", high: "しっかり張っている" },
    eyeOpenness: { lo: 0.28, hi: 0.40, low: "切れ長", high: "ぱっちり" },
    eyeGap: { lo: 0.95, hi: 1.25, low: "やや近め", high: "やや離れぎみ" },
  };

  function noteFor(key, value) {
    const r = REFERENCE[key];
    if (value < r.lo) return r.low;
    if (value > r.hi) return r.high;
    return "標準的";
  }

  function describe(m) {
    const pct = (v) => Math.round(v * 100);
    return [
      {
        label: "顔の縦横比",
        value: m.faceRatio.toFixed(2) + " : 1",
        ref: "目安 1.20〜1.45",
        note: noteFor("faceRatio", m.faceRatio),
      },
      {
        label: "エラの張り",
        value: pct(m.jawRatio) + "%",
        ref: "目安 74〜90%",
        note: noteFor("jawRatio", m.jawRatio),
      },
      {
        label: "目の丸さ",
        value: pct(m.eyeOpenness) + "%",
        ref: "目安 28〜40%",
        note: noteFor("eyeOpenness", m.eyeOpenness),
      },
      {
        label: "目と目の間隔",
        value: m.eyeGap.toFixed(2) + " 個ぶん",
        ref: "目安 0.95〜1.25",
        note: noteFor("eyeGap", m.eyeGap),
      },
    ];
  }

  /**
   * 画像から顔立ちを判定する。
   * @returns {Promise<object|null>} 判定できなければ null
   */
  async function detect(source) {
    const landmarker = await getLandmarker();
    if (!landmarker) return null;
    try {
      const result = landmarker.detect(source);
      const faces = result && result.faceLandmarks;
      if (!faces || !faces.length) return null;
      const aspect = source.height / source.width;
      const type = classify(measure(faces[0], aspect));
      if (type) type.details = describe(type.measures);
      return type;
    } catch {
      return null;
    }
  }

  window.KagamiFaceType = { detect, TYPES };
})();
