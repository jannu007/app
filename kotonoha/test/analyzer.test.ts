import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFeatures, TooQuietError, resample } from "../src/analyzer.ts";
import { interpretVoice, pickPhrase } from "../src/interpret.ts";
import { interpretBody } from "../src/body.ts";

const SR = 48000;

/** 疑似乱数（テストを毎回同じにする） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000 - 0.5;
  };
}

interface Seg { start: number; dur: number; f0From?: number; f0To?: number; noise?: number; amp?: number; am?: number }

function synth(totalSec: number, segs: Seg[], seed = 1): Float32Array {
  const out = new Float32Array(Math.floor(totalSec * SR));
  const rand = rng(seed);
  for (let i = 0; i < out.length; i++) out[i] = rand() * 0.002; // 部屋の雑音
  for (const s of segs) {
    const n = Math.floor(s.dur * SR);
    const off = Math.floor(s.start * SR);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const env = Math.min(1, t * 20, (1 - t) * 20) * (s.amp ?? 0.4) * (s.am ? 0.55 + 0.45 * Math.sin(2 * Math.PI * s.am * (i / SR)) : 1);
      let v = 0;
      if (s.f0From !== undefined) {
        const f = s.f0From + ((s.f0To ?? s.f0From) - s.f0From) * t;
        phase += (2 * Math.PI * f) / SR;
        v += Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase);
        v *= 0.6;
      }
      v += (s.noise ?? 0) * rand() * 2;
      const idx = off + i;
      if (idx < out.length) out[idx] = (out[idx] ?? 0) + v * env;
    }
  }
  return out;
}

const top = (samples: Float32Array, species: "dog" | "cat", ctx: "none" | "meal" = "none") => {
  const f = extractFeatures(samples, SR);
  const r = interpretVoice(f, species, ctx);
  return { f, r, id: r.candidates[0]?.meaning.id };
};

test("無音は TooQuietError", () => {
  assert.throws(() => extractFeatures(new Float32Array(SR * 2), SR), TooQuietError);
});

test("不正なサンプリング周波数は拒否", () => {
  assert.throws(() => extractFeatures(new Float32Array(SR), Number.NaN), RangeError);
});

test("リサンプリングで長さが比率どおりになる", () => {
  assert.equal(resample(new Float32Array(48000), 48000).length, 16000);
});

test("音程を正しく推定できる（600Hz）", () => {
  const { f } = top(synth(2, [{ start: 0.5, dur: 0.8, f0From: 600 }]), "cat");
  assert.ok(f.pitchHz !== null && Math.abs(f.pitchHz - 600) < 15, `pitch=${f.pitchHz}`);
  assert.ok(f.tonality > 0.7);
});

test("猫：語尾が上がるニャー → 要求", () => {
  const { id, f } = top(synth(2, [{ start: 0.4, dur: 0.8, f0From: 520, f0To: 780 }]), "cat");
  assert.ok(f.slopeSt > 2, `slope=${f.slopeSt}`);
  assert.equal(id, "cat-request");
});

test("猫：語尾が下がる長いニャー → 不満", () => {
  const { id } = top(synth(2.5, [{ start: 0.3, dur: 1.1, f0From: 800, f0To: 480 }]), "cat");
  assert.equal(id, "cat-complain");
});

test("猫：音程のない雑音 → 威嚇（シャー）", () => {
  const { id, f } = top(synth(2, [{ start: 0.4, dur: 0.9, noise: 0.5 }]), "cat");
  assert.equal(f.pitchHz, null);
  assert.equal(id, "cat-hiss");
});

test("猫：低く周期的にうなる音 → ゴロゴロ", () => {
  const { id, f } = top(synth(3, [{ start: 0.2, dur: 2.5, noise: 0.25, amp: 0.3, am: 26, f0From: 90 }]), "cat");
  assert.ok(f.purrLikeness > 0.4, `purr=${f.purrLikeness}`);
  assert.equal(id, "cat-purr");
});

test("ただの雑音はゴロゴロと判定しない", () => {
  const f = extractFeatures(synth(2, [{ start: 0.4, dur: 0.9, noise: 0.5 }]), SR);
  assert.ok(f.purrLikeness < 0.25, `purr=${f.purrLikeness}`);
});

test("犬：低く短い吠えの連続 → 警戒", () => {
  const segs: Seg[] = [0, 1, 2, 3, 4].map((k) => ({ start: 0.3 + k * 0.32, dur: 0.16, f0From: 330, f0To: 300, noise: 0.25 }));
  const { id, f } = top(synth(2.5, segs), "dog");
  assert.equal(f.burstCount, 5);
  assert.equal(id, "dog-alert");
});

test("犬：高く澄んだ声 → 寂しい・不安", () => {
  const { id } = top(synth(2.5, [{ start: 0.3, dur: 0.7, f0From: 1000, f0To: 1050, amp: 0.15 }, { start: 1.3, dur: 0.7, f0From: 1050, f0To: 1000, amp: 0.15 }]), "dog");
  assert.equal(id, "dog-whine");
});

test("犬：低く長い濁った声 → 警告（うなり）", () => {
  const { id } = top(synth(2.5, [{ start: 0.3, dur: 1.6, f0From: 140, noise: 0.15 }]), "dog");
  assert.equal(id, "dog-growl");
});

test("状況（ごはん前）で要求の確率が上がる", () => {
  const segs: Seg[] = [0, 1, 2].map((k) => ({ start: 0.3 + k * 0.9, dur: 0.2, f0From: 600, noise: 0.05 }));
  const samples = synth(3.2, segs);
  const f = extractFeatures(samples, SR);
  const none = interpretVoice(f, "dog", "none").candidates.find((c) => c.meaning.id === "dog-demand")?.confidence ?? 0;
  const meal = interpretVoice(f, "dog", "meal").candidates.find((c) => c.meaning.id === "dog-demand")?.confidence ?? 0;
  assert.ok(meal > none, `none=${none} meal=${meal}`);
});

test("確率の合計はおよそ100%", () => {
  const f = extractFeatures(synth(2, [{ start: 0.4, dur: 0.8, f0From: 600 }]), SR);
  const sum = interpretVoice(f, "cat", "none").candidates.reduce((s, c) => s + c.confidence, 0);
  assert.ok(sum >= 97 && sum <= 103, `sum=${sum}`);
});

test("しぐさ：プレイバウ＋弾む → 遊ぼう", () => {
  const r = interpretBody("dog", new Set(["d-play-bow", "d-bouncy"]));
  assert.equal(r?.candidates[0]?.mood.id, "dog-play");
});

test("しぐさ：相反するサインは mixed", () => {
  const r = interpretBody("dog", new Set(["d-tail-loose", "d-teeth"]));
  assert.equal(r?.mixed, true);
});

test("しぐさ：未選択は null、他の種のIDは無視", () => {
  assert.equal(interpretBody("cat", new Set()), null);
  assert.equal(interpretBody("cat", new Set(["d-play-bow"])), null);
});

test("状況に合った言い回しを選ぶ", () => {
  const f = extractFeatures(synth(2, [{ start: 0.4, dur: 0.8, f0From: 520, f0To: 780 }]), SR);
  const m = interpretVoice(f, "cat", "meal").candidates[0]?.meaning;
  assert.ok(m);
  assert.equal(pickPhrase(m, f, "meal"), "ごはんまだ？お願い！");
});
