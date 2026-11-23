// 依存ライブラリなしの最小ZIPリーダー（EPUB・青空文庫ZIP用）。
// 展開はブラウザ標準の DecompressionStream("deflate-raw") を使う。

const utf8 = new TextDecoder("utf-8");
const utf8Strict = new TextDecoder("utf-8", { fatal: true });
let sjis = null;
try { sjis = new TextDecoder("shift_jis"); } catch { sjis = utf8; }

function decodeName(bytes, isUtf8) {
  if (isUtf8) return utf8.decode(bytes);
  try { return utf8Strict.decode(bytes); } catch { return sjis.decode(bytes); }
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("このブラウザはZIPの展開に対応していません。最新のブラウザでお試しください。");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function isZip(u8) {
  return u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
}

export function readZip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIPファイルとして読み込めませんでした。");
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) break;
    const flags = dv.getUint16(off + 8, true);
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const usize = dv.getUint32(off + 24, true);
    const nlen = dv.getUint16(off + 28, true);
    const elen = dv.getUint16(off + 30, true);
    const clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = decodeName(u8.subarray(off + 46, off + 46 + nlen), (flags & 0x800) !== 0);
    entries.set(name, { name, method, csize, usize, lho, encrypted: (flags & 1) !== 0 });
    off += 46 + nlen + elen + clen;
  }

  async function bytes(name) {
    const e = entries.get(name) || findCaseInsensitive(name);
    if (!e) return null;
    if (e.encrypted) throw new Error("暗号化（DRM付き）されたファイルは開けません。");
    const lnl = dv.getUint16(e.lho + 26, true);
    const lel = dv.getUint16(e.lho + 28, true);
    const start = e.lho + 30 + lnl + lel;
    const data = u8.subarray(start, start + e.csize);
    if (e.method === 0) return data.slice();
    if (e.method === 8) return inflateRaw(data);
    throw new Error("未対応の圧縮形式です。");
  }
  function findCaseInsensitive(name) {
    const low = name.toLowerCase();
    for (const [k, v] of entries) if (k.toLowerCase() === low) return v;
    return null;
  }
  async function text(name) {
    const b = await bytes(name);
    return b ? utf8.decode(b) : null;
  }
  return { entries, names: [...entries.keys()], bytes, text, has: (n) => entries.has(n) || !!findCaseInsensitive(n) };
}
