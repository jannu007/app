# 同梱ライブラリとモデルについて

うつし鏡は、顔の特徴点（ランドマーク）の検出に MediaPipe を使用しています。
いずれもこのフォルダに同梱してあり、実行時に外部サーバーへ取りに行くことはありません。
解析はすべて端末内で完結します。

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
