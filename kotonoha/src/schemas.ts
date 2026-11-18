/* ===========================================================
   入力・保存データのスキーマ（Zod）
   localStorage の中身は「信頼できない入力」として毎回検証する
   （拡張機能や手動編集で壊れた/改ざんされたデータでも画面を壊さない）
   =========================================================== */
import { z } from "zod";

export const SpeciesSchema = z.enum(["dog", "cat"]);
export type Species = z.infer<typeof SpeciesSchema>;

export const ContextSchema = z.enum(["none", "meal", "visitor", "alone", "play", "vet", "night", "touch"]);
export type Context = z.infer<typeof ContextSchema>;

/** 制御文字を含まない、前後の空白を除いた短いテキスト */
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください`)
    // eslint-disable-next-line no-control-regex
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "使用できない文字が含まれています");

export const PetNameSchema = safeText(20);
export const MemoSchema = safeText(200);

export const SettingsSchema = z.object({
  species: SpeciesSchema.default("dog"),
  petName: PetNameSchema.default(""),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const RecordSchema = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/),
  createdAt: z.iso.datetime(),
  kind: z.enum(["voice", "body"]),
  species: SpeciesSchema,
  petName: PetNameSchema,
  meaningId: z.string().regex(/^[a-z]+-[a-z_]+$/).max(40),
  label: safeText(40),
  emoji: z.string().max(16),
  phrase: safeText(120),
  confidence: z.number().int().min(0).max(100),
  arousal: z.number().int().min(0).max(100).nullable(),
  context: ContextSchema,
  memo: MemoSchema,
});
export type HistoryRecord = z.infer<typeof RecordSchema>;

/** 読み込む件数の上限（巨大データでメモリを使い切らないように、検証の前に切り詰める） */
export const HISTORY_LIMIT = 300;

/** 音声ファイルの上限 */
export const AudioFileSchema = z.object({
  size: z.number().max(30 * 1024 * 1024, "ファイルが大きすぎます（30MBまで）").min(1, "空のファイルです"),
  type: z.string().refine((t) => t === "" || t.startsWith("audio/") || t.startsWith("video/"), "音声または動画ファイルを選んでください"),
});
