/* ===========================================================
   うつし鏡 — 学習済みモデルによる年齢の推定

   顔写真から年齢を推定する学習済みモデル（face-api.js の AgeGenderNet）を
   同梱して使います。画像の特徴から年齢を測る経験則（js/measure.js）よりも、
   実際の顔写真に対してずっと正確です。

   モデルは vendor/faceapi/ に同梱してあり、実行時に外部へ取りに行くことは
   ありません。画像も端末内から出ません。（ライセンスは vendor/LICENSES.md）

   モデルを読み込めない環境では null を返し、呼び出し側は経験則の推定に
   切り替えます。
   =========================================================== */
(() => {
  "use strict";

  // モデルの取得はページからの相対、モジュールの読み込みはこのファイルからの相対。
  // 通常のスクリプト内の import() は、スクリプト自身の位置を基準に解決されるため。
  const BASE = "./vendor/faceapi";
  const MODULE_URL = "../vendor/faceapi/face-api.esm.js";

  let apiPromise = null;

  /**
   * face-api を用意する。初回だけ読み込み、以後は使い回す。
   *
   * 計算は WebGL に任せる。使えない端末では CPU に落とす。
   * （既定の WebAssembly は別のバイナリが必要になるため使わない）
   */
  function getApi() {
    if (apiPromise) return apiPromise;
    apiPromise = (async () => {
      const faceapi = await import(MODULE_URL);
      try {
        await faceapi.tf.setBackend("webgl");
        await faceapi.tf.ready();
      } catch {
        await faceapi.tf.setBackend("cpu");
        await faceapi.tf.ready();
      }
      await faceapi.nets.tinyFaceDetector.loadFromUri(BASE);
      await faceapi.nets.ageGenderNet.loadFromUri(BASE);
      return faceapi;
    })().catch(() => null);
    return apiPromise;
  }

  /* ---------------- 顔の向きをそろえる ---------------- */

  const EYE_A = [33, 133, 159, 145];
  const EYE_B = [263, 362, 386, 374];
  const FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
    379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
    234, 127, 162, 21, 54, 103, 67, 109,
  ];

  function eyeAngle(source, landmarks) {
    const sw = source.width, sh = source.height;
    const mid = (ids) => {
      let x = 0, y = 0;
      ids.forEach((i) => { x += landmarks[i].x * sw; y += landmarks[i].y * sh; });
      return { x: x / ids.length, y: y / ids.length };
    };
    const a = mid(EYE_A), b = mid(EYE_B);
    return { angle: Math.atan2(b.y - a.y, b.x - a.x), a, b };
  }

  /**
   * 目が水平になるように画像全体を回して返す。
   *
   * 顔の切り出しは、モデルに付属する検出器の取り方に任せたい。
   * （モデルはその取り方の画像で学習しているため、そこを自作すると精度が落ちる）
   * こちらは傾きだけ直しておく。斜めのままだと検出器が顔を見つけられない。
   */
  function upright(source, landmarks) {
    const { angle } = eyeAngle(source, landmarks);
    if (Math.abs(angle) < 0.02) return source;

    const sw = source.width, sh = source.height;
    const side = Math.ceil(Math.hypot(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(side / 2, side / 2);
    ctx.rotate(-angle);
    ctx.translate(-sw / 2, -sh / 2);
    ctx.drawImage(source, 0, 0);
    return canvas;
  }

  /**
   * 特徴点の輪郭から顔を正方形に切り出す（検出器が顔を見つけられないときの予備）。
   * margin は輪郭のまわりに取る余白の割合。
   */
  function cropFace(source, landmarks, margin, size) {
    const sw = source.width, sh = source.height;
    const { angle, a, b } = eyeAngle(source, landmarks);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const cos = Math.cos(-angle), sin = Math.sin(-angle);

    const rotated = FACE_OVAL.map((i) => {
      const dx = landmarks[i].x * sw - mid.x;
      const dy = landmarks[i].y * sh - mid.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    });
    const xs = rotated.map((p) => p.x), ys = rotated.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const side = Math.max(maxX - minX, maxY - minY) * (1 + margin * 2);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const scale = size / side;
    ctx.translate(size / 2, size / 2);
    ctx.scale(scale, scale);
    ctx.rotate(-angle);
    ctx.translate(-mid.x - (cx * cos + cy * sin), -mid.y - (-cx * sin + cy * cos));
    ctx.drawImage(source, 0, 0);
    return canvas;
  }

  const median = (a) => {
    const b = a.slice().sort((x, y) => x - y);
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };

  /* ---------------- 公開API ---------------- */

  /**
   * 年齢を推定する。
   * @param {HTMLCanvasElement|HTMLImageElement} source 元画像
   * @param {Array} landmarks 顔の特徴点（無くても動くが、傾いた写真に弱くなる）
   * @returns {Promise<{age:number, range:number, source:string}|null>}
   */
  async function estimate(source, landmarks) {
    const faceapi = await getApi();
    if (!faceapi) return null;

    try {
      // 1) 傾きだけ直して、モデル付属の検出器に顔の枠を決めてもらう
      const image = landmarks ? upright(source, landmarks) : source;
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 });
      const detected = await faceapi.detectSingleFace(image, options).withAgeAndGender();
      if (detected && Number.isFinite(detected.age)) {
        return { age: detected.age, range: 5, source: "model" };
      }

      // 2) 検出器が見つけられないときは、特徴点から切り出して測る。
      //    切り出しの余白で結果が動くので、3通りの中央値を取る
      if (landmarks) {
        const ages = [];
        for (const margin of [0.10, 0.20, 0.30]) {
          const crop = cropFace(source, landmarks, margin, 224);
          const pred = await faceapi.nets.ageGenderNet.predictAgeAndGender(crop);
          if (Number.isFinite(pred.age)) ages.push(pred.age);
        }
        if (ages.length) return { age: median(ages), range: 7, source: "model-crop" };
      }
    } catch {
      return null;
    }
    return null;
  }

  window.KagamiAgeModel = { estimate };
})();
