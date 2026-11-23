/* ===========================================================
   マイク録音・音声ファイル読み込み（端末内のみ）
   =========================================================== */
import { AudioFileSchema } from "./schemas.ts";

export const MAX_RECORD_SEC = 6;
const MAX_FILE_SEC = 15;

export interface Pcm {
  samples: Float32Array;
  sampleRate: number;
}

export class AudioInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioInputError";
  }
}

function concat(chunks: readonly Float32Array[]): Float32Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export interface Recording {
  analyser: AnalyserNode;
  /** 録音を止めてPCMを返す */
  stop(): Promise<Pcm>;
  /** 破棄（結果は使わない） */
  cancel(): void;
  elapsed(): number;
}

function describeMicError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      return "マイクの使用が許可されていません。ブラウザの設定でこのサイトのマイクを許可してください。";
    }
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
      return "マイクが見つかりませんでした。";
    }
    if (err.name === "NotReadableError") {
      return "マイクをほかのアプリが使用中のようです。";
    }
  }
  return "マイクを開始できませんでした。";
}

export async function startRecording(workletUrl: string): Promise<Recording> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new AudioInputError("マイクは HTTPS で開いたページでのみ使えます。");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // 鳴き声の特徴を残すため、音声向けの自動補正はできるだけ切る
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      video: false,
    });
  } catch (err: unknown) {
    throw new AudioInputError(describeMicError(err));
  }

  const ctx = new AudioContext();
  const release = (): void => {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  };
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } catch {
    release();
    throw new AudioInputError("このブラウザは録音に対応していません。最新のブラウザでお試しください。");
  }
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const node = new AudioWorkletNode(ctx, "kotonoha-recorder", { numberOfInputs: 1, numberOfOutputs: 0 });
  const chunks: Float32Array[] = [];
  const maxSamples = ctx.sampleRate * MAX_RECORD_SEC;
  let collected = 0;
  node.port.onmessage = (ev: MessageEvent<unknown>) => {
    if (ev.data instanceof Float32Array && collected < maxSamples) {
      chunks.push(ev.data);
      collected += ev.data.length;
    }
  };
  source.connect(analyser);
  source.connect(node);
  if (ctx.state === "suspended") await ctx.resume();
  const startedAt = performance.now();

  return {
    analyser,
    elapsed: () => (performance.now() - startedAt) / 1000,
    async stop(): Promise<Pcm> {
      // 最後のチャンクが届くのを少し待つ
      await new Promise((r) => setTimeout(r, 120));
      node.port.onmessage = null;
      source.disconnect();
      const sampleRate = ctx.sampleRate;
      release();
      return { samples: concat(chunks).subarray(0, maxSamples), sampleRate };
    },
    cancel(): void {
      node.port.onmessage = null;
      release();
    },
  };
}

export async function decodeFile(file: File): Promise<Pcm> {
  const check = AudioFileSchema.safeParse({ size: file.size, type: file.type });
  if (!check.success) {
    throw new AudioInputError(check.error.issues[0]?.message ?? "このファイルは使えません");
  }
  const buf = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const len = Math.min(audio.length, Math.floor(audio.sampleRate * MAX_FILE_SEC));
    const mono = new Float32Array(len);
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const data = audio.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / audio.numberOfChannels;
    }
    return { samples: mono, sampleRate: audio.sampleRate };
  } catch {
    throw new AudioInputError("音声を読み込めませんでした。別の形式（m4a / mp3 / wav など）でお試しください。");
  } finally {
    void ctx.close().catch(() => undefined);
  }
}
