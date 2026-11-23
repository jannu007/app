/* ===========================================================
   端末内保存（localStorage）。サーバーには何も送らない
   =========================================================== */
import { z } from "zod";
import { HISTORY_LIMIT, RecordSchema, SettingsSchema, type HistoryRecord, type Settings } from "./schemas.ts";

const HISTORY_KEY = "kotonoha-history-v1";
const SETTINGS_KEY = "kotonoha-settings-v1";
/** これより大きい保存データは読まない（壊れたデータ対策） */
const MAX_RAW_BYTES = 1_000_000;

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw.length > MAX_RAW_BYTES) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  const parsed = SettingsSchema.safeParse(readJson(SETTINGS_KEY) ?? {});
  return parsed.success ? parsed.data : SettingsSchema.parse({});
}

export function saveSettings(s: Settings): boolean {
  return writeJson(SETTINGS_KEY, SettingsSchema.parse(s));
}

/** 1件ずつ検証し、壊れた項目だけ捨てる */
export function loadHistory(): HistoryRecord[] {
  const data = readJson(HISTORY_KEY);
  if (!Array.isArray(data)) return [];
  const out: HistoryRecord[] = [];
  for (const item of data.slice(0, HISTORY_LIMIT)) {
    const r = RecordSchema.safeParse(item);
    if (r.success) out.push(r.data);
  }
  return out;
}

export function addRecord(record: HistoryRecord): boolean {
  const valid = RecordSchema.parse(record);
  const next = [valid, ...loadHistory()].slice(0, HISTORY_LIMIT);
  return writeJson(HISTORY_KEY, z.array(RecordSchema).parse(next));
}

export function deleteRecord(id: string): void {
  writeJson(HISTORY_KEY, loadHistory().filter((r) => r.id !== id));
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* 何もしない */
  }
}
