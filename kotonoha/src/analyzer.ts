/* ===========================================================
   鳴き声の音響特徴を取り出す（DOM非依存・純粋関数）
   - 音声データは端末内でのみ処理し、どこにも送信・保存しない
   - 取り出すのは「高さ・大きさ・長さ・回数・抑揚・ザラザラ感」などの数値だけ
   =========================================================== */

export interface Burst {
  /** 開始・終了（秒） */
  start: number;
  end: number;
  /** この区間の基本周波数（Hz）の中央値。音程が取れない（雑音的）なら null */
  pitch: number | null;
  /** 区間の前半→後半の音程変化（半音）。正なら語尾が上がる */
  slope: number | null;
}

export interface Features {
  /** 録音全体の長さ（秒） */
  duration: number;
  /** 鳴いていた合計時間（秒） */
  activeSec: number;
  /** 鳴き声のかたまりの数 */
  burstCount: number;
  /** かたまり1つあたりの平均の長さ（秒） */
  meanBurstSec: number;
  /** 1秒あたりの鳴く回数（最初の鳴き始め〜最後の鳴き終わりの間で計算） */
  burstRate: number;
  /** 基本周波数の中央値（Hz）。音程が取れなければ null */
  pitchHz: number | null;
  /** 音程の幅（半音）。10〜90パーセンタイル */
  pitchRangeSt: number;
  /** 語尾の上がり下がり（半音）の平均。正=上がる */
  slopeSt: number;
  /** 音程の取れた割合 0..1（高いほど「声」らしく、低いほど「シャー」「ウー」のような雑音） */
  tonality: number;
  /** スペクトル平坦度 0..1（高いほどザラザラ・息っぽい） */
  noisiness: number;
  /** スペクトル重心（Hz）。高いほど明るくキンキンした音 */
  brightnessHz: number;
  /** ピークの音量（dBFS, 0が最大） */
  peakDb: number;
  /** 鳴いている間の音量のゆれ（変動係数）。小さいほど一定 */
  loudnessVariation: number;
  /** 20〜60Hzの規則的な振幅のうねり（ゴロゴロ音らしさ）0..1 */
  purrLikeness: number;
  bursts: Burst[];
}

export class TooQuietError extends Error {
  constructor() {
    super("鳴き声が検出できませんでした");
    this.name = "TooQuietError";
  }
}

/** 解析は 16kHz に揃えて行う（スマホでも軽く動かすため） */
export const ANALYSIS_RATE = 16000;
const FRAME = 1024;
const HOP = 256;
const MIN_PITCH = 70;
const MAX_PITCH = 2200;

/* ---------------- 小さな数値ユーティリティ ---------------- */

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid] ?? 0;
  if (s.length % 2 === 1) return hi;
  const lo = s[mid - 1] ?? hi;
  return (lo + hi) / 2;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx] ?? 0;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function semitones(a: number, b: number): number {
  return 12 * Math.log2(b / a);
}

/** 簡易ローパス（移動平均）＋線形補間で ANALYSIS_RATE に間引く */
export function resample(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate <= ANALYSIS_RATE) return samples;
  const ratio = sampleRate / ANALYSIS_RATE;
  const win = Math.max(1, Math.round(ratio));
  // 累積和で移動平均
  const cum = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i++) cum[i + 1] = (cum[i] ?? 0) + (samples[i] ?? 0);
  const smooth = (i: number): number => {
    const a = Math.max(0, i - Math.floor(win / 2));
    const b = Math.min(samples.length, a + win);
    return ((cum[b] ?? 0) - (cum[a] ?? 0)) / Math.max(1, b - a);
  };
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let j = 0; j < outLen; j++) {
    const pos = j * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    out[j] = smooth(i0) * (1 - frac) + smooth(Math.min(samples.length - 1, i0 + 1)) * frac;
  }
  return out;
}

/* ---------------- FFT（基数2・インプレース） ---------------- */

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = tr;
      const ti = im[i] ?? 0;
      im[i] = im[j] ?? 0;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci;
        const xi = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const hann = (() => {
  const w = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  return w;
})();

interface FrameInfo {
  rms: number;
  pitch: number | null;
  flatness: number;
  centroid: number;
}

/** YIN 法による基本周波数推定（しきい値 0.15）。取れなければ null */
function detectPitch(frame: Float64Array, sampleRate: number): number | null {
  const maxLag = Math.min(Math.floor(sampleRate / MIN_PITCH), Math.floor(frame.length / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_PITCH));
  const half = frame.length - maxLag;
  const d = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const diff = (frame[i] ?? 0) - (frame[i + lag] ?? 0);
      sum += diff * diff;
    }
    d[lag] = sum;
  }
  // 累積平均正規化差分
  let running = 0;
  const cmnd = new Float64Array(maxLag + 1);
  cmnd[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag] ?? 0;
    cmnd[lag] = running > 0 ? ((d[lag] ?? 0) * lag) / running : 1;
  }
  const threshold = 0.15;
  for (let lag = minLag; lag < maxLag; lag++) {
    if ((cmnd[lag] ?? 1) < threshold) {
      let best = lag;
      while (best + 1 < maxLag && (cmnd[best + 1] ?? 1) < (cmnd[best] ?? 1)) best++;
      // 放物線補間
      const y0 = cmnd[best - 1] ?? 1;
      const y1 = cmnd[best] ?? 1;
      const y2 = cmnd[best + 1] ?? 1;
      const denom = y0 - 2 * y1 + y2;
      const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
      const refined = best + Math.max(-1, Math.min(1, shift));
      return sampleRate / refined;
    }
  }
  return null;
}

function analyzeFrame(samples: Float32Array, offset: number, sampleRate: number): FrameInfo {
  const raw = new Float64Array(FRAME);
  let energy = 0;
  for (let i = 0; i < FRAME; i++) {
    const v = samples[offset + i] ?? 0;
    raw[i] = v;
    energy += v * v;
  }
  const rms = Math.sqrt(energy / FRAME);

  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) re[i] = (raw[i] ?? 0) * (hann[i] ?? 0);
  fft(re, im);

  // 100Hz〜8kHz の範囲で平坦度と重心を計算
  const binHz = sampleRate / FRAME;
  const lo = Math.max(1, Math.floor(100 / binHz));
  const hi = Math.min(FRAME / 2, Math.floor(8000 / binHz));
  let logSum = 0;
  let linSum = 0;
  let weighted = 0;
  let count = 0;
  for (let k = lo; k < hi; k++) {
    const p = (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2 + 1e-12;
    logSum += Math.log(p);
    linSum += p;
    weighted += p * k * binHz;
    count++;
  }
  const flatness = count > 0 ? Math.exp(logSum / count) / (linSum / count) : 0;
  const centroid = linSum > 0 ? weighted / linSum : 0;

  const pitch = rms > 1e-4 ? detectPitch(raw, sampleRate) : null;
  return { rms, pitch, flatness, centroid };
}

/** 振幅包絡に 20〜60Hz の周期的なうねりがあるか（ゴロゴロ音の手がかり） */
function purrScore(samples: Float32Array, sampleRate: number, start: number, end: number): number {
  // 包絡を 1kHz 程度に間引いて自己相関を見る
  const step = Math.max(1, Math.floor(sampleRate / 1000));
  const envRate = sampleRate / step;
  const env: number[] = [];
  const s0 = Math.floor(start * sampleRate);
  const s1 = Math.min(samples.length, Math.floor(end * sampleRate));
  for (let i = s0; i + step <= s1; i += step) {
    let acc = 0;
    for (let j = 0; j < step; j++) acc += Math.abs(samples[i + j] ?? 0);
    env.push(acc / step);
  }
  if (env.length < envRate * 0.5) return 0;
  // 80ms の移動平均を引いて、立ち上がり・減衰などのゆっくりした変化を取り除く
  const half = Math.round(envRate * 0.04);
  const x = env.map((_, i) => {
    const a = Math.max(0, i - half);
    const b = Math.min(env.length, i + half + 1);
    let acc = 0;
    for (let j = a; j < b; j++) acc += env[j] ?? 0;
    return (env[i] ?? 0) - acc / (b - a);
  });
  let r0 = 0;
  for (const v of x) r0 += v * v;
  if (r0 <= 0) return 0;
  let best = 0;
  const minLag = Math.floor(envRate / 60);
  const maxLag = Math.ceil(envRate / 20);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i + lag < x.length; i++) r += (x[i] ?? 0) * (x[i + lag] ?? 0);
    best = Math.max(best, r / r0);
  }
  return Math.max(0, Math.min(1, best));
}

/**
 * モノラル音声から特徴量を求める。
 * @throws TooQuietError 鳴き声らしい区間が見つからないとき
 */
export function extractFeatures(input: Float32Array, inputRate: number): Features {
  if (!Number.isFinite(inputRate) || inputRate < 8000 || inputRate > 192000) {
    throw new RangeError("サンプリング周波数が不正です");
  }
  const samples = resample(input, inputRate);
  const sampleRate = Math.min(inputRate, ANALYSIS_RATE);
  const duration = samples.length / sampleRate;
  if (samples.length < FRAME * 2) throw new TooQuietError();

  const frames: FrameInfo[] = [];
  for (let off = 0; off + FRAME <= samples.length; off += HOP) {
    frames.push(analyzeFrame(samples, off, sampleRate));
  }
  const hopSec = HOP / sampleRate;
  const frameTime = (i: number): number => (i * HOP + FRAME / 2) / sampleRate;

  // 背景雑音レベルから「鳴いている」フレームのしきい値を決める
  const rmsList = frames.map((f) => f.rms);
  const noiseFloor = percentile(rmsList, 15);
  const peak = Math.max(...rmsList);
  const threshold = Math.max(noiseFloor * 3, peak * 0.12, 0.004);
  if (peak < 0.006) throw new TooQuietError();

  const active = frames.map((f) => f.rms >= threshold);

  // 連続した区間をまとめる（80ms 未満のすき間はつなげ、40ms 未満の区間は捨てる）
  const maxGap = Math.round(0.08 / hopSec);
  const minLen = Math.max(1, Math.round(0.04 / hopSec));
  const segments: Array<[number, number]> = [];
  let segStart = -1;
  let lastActive = -1;
  for (let i = 0; i < active.length; i++) {
    if (active[i]) {
      if (segStart < 0) segStart = i;
      else if (i - lastActive > maxGap) {
        segments.push([segStart, lastActive]);
        segStart = i;
      }
      lastActive = i;
    }
  }
  if (segStart >= 0) segments.push([segStart, lastActive]);
  const kept = segments.filter(([a, b]) => b - a + 1 >= minLen);
  if (kept.length === 0) throw new TooQuietError();

  const bursts: Burst[] = [];
  const allPitches: number[] = [];
  const flatList: number[] = [];
  const centroidList: number[] = [];
  const activeRms: number[] = [];
  let voicedFrames = 0;
  let activeFrames = 0;

  for (const [a, b] of kept) {
    const pitches: Array<{ t: number; hz: number }> = [];
    for (let i = a; i <= b; i++) {
      const f = frames[i];
      if (!f || !active[i]) continue;
      activeFrames++;
      activeRms.push(f.rms);
      flatList.push(f.flatness);
      centroidList.push(f.centroid);
      if (f.pitch !== null) {
        voicedFrames++;
        pitches.push({ t: i, hz: f.pitch });
      }
    }
    const start = frameTime(a) - FRAME / 2 / sampleRate;
    const end = frameTime(b) + FRAME / 2 / sampleRate;
    // 半分以上で音程が取れた区間だけ「声」として扱う
    const voicedEnough = pitches.length >= Math.max(2, (b - a + 1) * 0.4);
    let pitch: number | null = null;
    let slope: number | null = null;
    if (voicedEnough) {
      const hzList = pitches.map((p) => p.hz);
      pitch = median(hzList);
      // オクターブ誤りの外れ値を除く
      const clean = pitches.filter((p) => Math.abs(semitones(pitch ?? p.hz, p.hz)) < 7);
      allPitches.push(...clean.map((p) => p.hz));
      if (clean.length >= 4) {
        const third = Math.max(1, Math.floor(clean.length / 3));
        const head = median(clean.slice(0, third).map((p) => p.hz));
        const tail = median(clean.slice(-third).map((p) => p.hz));
        slope = semitones(head, tail);
      }
    }
    bursts.push({ start: Math.max(0, start), end: Math.min(duration, end), pitch, slope });
  }

  const burstDurations = bursts.map((b) => b.end - b.start);
  const activeSec = burstDurations.reduce((s, v) => s + v, 0);
  const first = bursts[0];
  const last = bursts[bursts.length - 1];
  const span = first && last ? Math.max(0.25, last.end - first.start) : duration;
  const slopes = bursts.map((b) => b.slope).filter((s): s is number => s !== null);
  const meanRms = mean(activeRms);
  const sdRms = Math.sqrt(mean(activeRms.map((v) => (v - meanRms) ** 2)));

  // ゴロゴロ音は最も長い区間で調べる
  let longest = bursts[0];
  for (const b of bursts) if (longest && b.end - b.start > longest.end - longest.start) longest = b;
  const purrLikeness = longest && longest.end - longest.start >= 0.8
    ? purrScore(samples, sampleRate, longest.start, longest.end)
    : 0;

  return {
    duration,
    activeSec,
    burstCount: bursts.length,
    meanBurstSec: mean(burstDurations),
    burstRate: bursts.length > 1 ? (bursts.length - 1) / span : 0,
    pitchHz: allPitches.length > 0 ? median(allPitches) : null,
    pitchRangeSt: allPitches.length > 2
      ? semitones(percentile(allPitches, 10), percentile(allPitches, 90))
      : 0,
    slopeSt: mean(slopes),
    tonality: activeFrames > 0 ? voicedFrames / activeFrames : 0,
    noisiness: mean(flatList),
    brightnessHz: mean(centroidList),
    peakDb: 20 * Math.log10(Math.max(peak, 1e-9)),
    loudnessVariation: meanRms > 0 ? sdRms / meanRms : 0,
    purrLikeness,
    bursts,
  };
}
