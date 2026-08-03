# 同梱ライブラリのライセンス

このフォルダには、PDF編集機能を実現するために以下のオープンソースライブラリをビルド済みファイルとして同梱しています。
CDNに依存せず、オフラインでも動作させるためにローカルへ同梱しています。すべて無料・商用利用可能なライセンスです。

- **pdf-lib** v1.17.1 ([pdf-lib.js.org](https://pdf-lib.js.org/)) — MIT License
  - PDFの結合・ページ操作・書き出しに使用（`pdf-lib.min.js`）
- **pdf.js** v3.11.174 ([mozilla.github.io/pdf.js](https://mozilla.github.io/pdf.js/)) — Apache License 2.0
  - PDFページのサムネイル表示に使用（`pdf.min.js` / `pdf.worker.min.js`）
- **JSZip** v3.10.1 ([stuk.github.io/jszip](https://stuk.github.io/jszip/)) — MIT License（またはGPL-3.0-or-later、デュアルライセンス）
  - ページ分割時のZIP書き出しに使用（`jszip.min.js`）

各ライブラリの著作権はそれぞれの開発者・コントリビューターに帰属します。
