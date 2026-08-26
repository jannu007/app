# 同梱ライブラリとモデルについて

うつし鏡は、顔の特徴点（ランドマーク）の検出に MediaPipe を、年齢の推定に
face-api.js を使用しています。いずれもこのフォルダに同梱してあり、実行時に
外部サーバーへ取りに行くことはありません。解析はすべて端末内で完結します。

## MediaPipe Tasks Vision

- 提供元: Google LLC
- ライセンス: Apache License 2.0
- 入手元: https://www.npmjs.com/package/@mediapipe/tasks-vision
- 同梱ファイル:
  - `mediapipe/vision_bundle.mjs`
  - `mediapipe/wasm/vision_wasm_internal.js`
  - `mediapipe/wasm/vision_wasm_internal.wasm`

SIMD対応版のみを同梱しています。WebAssembly の SIMD に対応しない古い環境では
顔立ちの判定だけが動作せず、肌の解析はそのまま利用できます。

## Face Landmarker モデル

- 提供元: Google LLC
- ライセンス: Apache License 2.0
- 入手元: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- 同梱ファイル: `mediapipe/face_landmarker.task`

## Apache License 2.0 について

全文は https://www.apache.org/licenses/LICENSE-2.0 を参照してください。

    Copyright 2023 The MediaPipe Authors.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

## face-api.js（年齢推定）

- 提供元: Vladimir Mandic（`@vladmandic/face-api`。justadudewhohacks による face-api.js の派生）
- ライセンス: MIT License
- 入手元: https://www.npmjs.com/package/@vladmandic/face-api
- 同梱ファイル:
  - `faceapi/face-api.esm.js`（TensorFlow.js を含む実行本体）
  - `faceapi/age_gender_model.bin` / `age_gender_model-weights_manifest.json`（年齢・性別の推定モデル）
  - `faceapi/tiny_face_detector_model.bin` / `tiny_face_detector_model-weights_manifest.json`（顔の枠の検出）

アプリで使っているのは年齢の推定のみです。性別の推定結果は表示しません。

### MIT License について

    MIT License

    Copyright (c) Vladimir Mandic

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
