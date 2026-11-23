import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoSchema, PetNameSchema, RecordSchema, SettingsSchema, AudioFileSchema } from "../src/schemas.ts";

const valid = {
  id: "0b9f2c1e-7a4d-4c1b-9f2e-1a2b3c4d5e6f",
  createdAt: "2026-11-18T03:00:00.000Z",
  kind: "voice",
  species: "cat",
  petName: "こむぎ",
  meaningId: "cat-request",
  label: "要求・おねがい",
  emoji: "🍽️",
  phrase: "ごはんまだ？",
  confidence: 62,
  arousal: 40,
  context: "meal",
  memo: "",
};

test("正しい記録は通る", () => {
  assert.equal(RecordSchema.safeParse(valid).success, true);
});

test("改ざんされた記録は弾く", () => {
  assert.equal(RecordSchema.safeParse({ ...valid, confidence: 150 }).success, false);
  assert.equal(RecordSchema.safeParse({ ...valid, species: "dragon" }).success, false);
  assert.equal(RecordSchema.safeParse({ ...valid, id: "../../etc" }).success, false);
  assert.equal(RecordSchema.safeParse({ ...valid, meaningId: "<img src=x>" }).success, false);
  assert.equal(RecordSchema.safeParse({ ...valid, createdAt: "yesterday" }).success, false);
});

test("名前・メモの長さと制御文字", () => {
  assert.equal(PetNameSchema.safeParse("あ".repeat(21)).success, false);
  assert.equal(PetNameSchema.parse("  ポチ  "), "ポチ");
  assert.equal(MemoSchema.safeParse("a\u0000b").success, false);
  assert.equal(MemoSchema.safeParse("x".repeat(201)).success, false);
});

test("設定は欠けていても既定値で補う", () => {
  assert.deepEqual(SettingsSchema.parse({}), { species: "dog", petName: "" });
  assert.equal(SettingsSchema.safeParse({ species: 1 }).success, false);
});

test("音声ファイルの種類とサイズ", () => {
  assert.equal(AudioFileSchema.safeParse({ size: 1000, type: "audio/mp4" }).success, true);
  assert.equal(AudioFileSchema.safeParse({ size: 1000, type: "text/html" }).success, false);
  assert.equal(AudioFileSchema.safeParse({ size: 31 * 1024 * 1024, type: "audio/wav" }).success, false);
});
