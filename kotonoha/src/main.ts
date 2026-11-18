/* ===========================================================
   どうぶつ言の葉 — 画面の制御
   - 画面に出す文字はすべて textContent で入れる（innerHTML 不使用 → XSS 対策）
   - 入力（名前・メモ・ファイル）と保存データは Zod で検証する
   =========================================================== */
import { extractFeatures, TooQuietError, type Features } from "./analyzer.ts";
import { AudioInputError, decodeFile, MAX_RECORD_SEC, startRecording, type Pcm, type Recording } from "./audio.ts";
import { interpretBody, signalsFor, type Signal } from "./body.ts";
import { interpretVoice, pickPhrase } from "./interpret.ts";
import {
  ContextSchema,
  MemoSchema,
  PetNameSchema,
  RecordSchema,
  SpeciesSchema,
  type Context,
  type HistoryRecord,
  type Species,
} from "./schemas.ts";
import { addRecord, clearHistory, deleteRecord, loadHistory, loadSettings, saveSettings } from "./storage.ts";

/* ---------------- DOM ユーティリティ ---------------- */

function $<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

let toastTimer: number | undefined;
function toast(msg: string): void {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2800);
}

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ---------------- 状態 ---------------- */

const settings = loadSettings();
let context: Context = "none";
const selectedSignals = new Set<string>();

const CONTEXT_LABELS: ReadonlyArray<readonly [Context, string]> = [
  ["none", "指定なし"],
  ["meal", "🍚 ごはん前"],
  ["visitor", "🚪 来客・物音"],
  ["alone", "🏠 ひとりの時"],
  ["play", "🎾 遊び中"],
  ["touch", "🤲 なでている時"],
  ["vet", "🏥 病院・移動中"],
  ["night", "🌙 夜"],
];

const speciesName = (s: Species): string => (s === "dog" ? "犬" : "猫");
const speakerName = (): string => settings.petName || (settings.species === "dog" ? "わんこ" : "にゃんこ");

/* ---------------- メニュー・ダイアログ ---------------- */

const menuBtn = $<HTMLButtonElement>("#menuBtn");
const menuPanel = $("#menuPanel");
const menuScrim = $("#menuScrim");
function setMenu(open: boolean): void {
  menuPanel.hidden = !open;
  menuScrim.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
}
menuBtn.addEventListener("click", () => setMenu(menuPanel.hidden));
menuScrim.addEventListener("click", () => setMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});

const aboutDialog = $<HTMLDialogElement>("#aboutDialog");
$("#aboutClose").addEventListener("click", () => aboutDialog.close());

menuPanel.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]") : null;
  if (!target) return;
  setMenu(false);
  if (target.dataset.action === "about") aboutDialog.showModal();
  if (target.dataset.action === "clear") {
    if (window.confirm("記録をすべて削除します。よろしいですか？")) {
      clearHistory();
      renderHistory();
      toast("記録を削除しました");
    }
  }
});

/* ---------------- 種類・名前 ---------------- */

const speciesBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(".species-btn"));
function applySpecies(): void {
  for (const b of speciesBtns) b.setAttribute("aria-checked", String(b.dataset.species === settings.species));
  document.documentElement.dataset.species = settings.species;
  selectedSignals.clear();
  renderSignals();
  $("#voiceResult").hidden = true;
  $("#bodyResult").hidden = true;
}
for (const b of speciesBtns) {
  b.addEventListener("click", () => {
    const parsed = SpeciesSchema.safeParse(b.dataset.species);
    if (!parsed.success || parsed.data === settings.species) return;
    settings.species = parsed.data;
    saveSettings(settings);
    applySpecies();
  });
}

const petNameInput = $<HTMLInputElement>("#petName");
petNameInput.value = settings.petName;
petNameInput.addEventListener("change", () => {
  const parsed = PetNameSchema.safeParse(petNameInput.value);
  if (!parsed.success) {
    toast(parsed.error.issues[0]?.message ?? "名前を確認してください");
    petNameInput.value = settings.petName;
    return;
  }
  settings.petName = parsed.data;
  petNameInput.value = parsed.data;
  saveSettings(settings);
});

/* ---------------- タブ ---------------- */

const tabBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab-btn"));
function setTab(name: string): void {
  for (const b of tabBtns) {
    const active = b.dataset.tab === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  }
  for (const id of ["voice", "body", "history"]) $(`#panel-${id}`).hidden = id !== name;
  if (name === "history") renderHistory();
  if (name !== "voice") cancelRecording();
}
for (const b of tabBtns) b.addEventListener("click", () => setTab(b.dataset.tab ?? "voice"));

/* ---------------- 状況チップ ---------------- */

const contextChips = $("#contextChips");
for (const [value, label] of CONTEXT_LABELS) {
  const chip = h("button", { class: "chip", text: label, attrs: { type: "button", role: "radio", "data-context": value, "aria-checked": String(value === context) } });
  chip.addEventListener("click", () => {
    const parsed = ContextSchema.safeParse(chip.dataset.context);
    if (!parsed.success) return;
    context = parsed.data;
    for (const c of contextChips.querySelectorAll<HTMLElement>(".chip")) {
      c.setAttribute("aria-checked", String(c.dataset.context === context));
    }
  });
  contextChips.append(chip);
}

/* ---------------- 結果カード（共通） ---------------- */

interface ResultView {
  kind: "voice" | "body";
  meaningId: string;
  emoji: string;
  label: string;
  phrase: string;
  confidence: number;
  others: ReadonlyArray<{ emoji: string; label: string; confidence: number }>;
  arousal: number | null;
  evidence: readonly string[];
  why: string | null;
  advice: string;
  caution: string | null;
  note: string | null;
}

function bar(label: string, value: number, cls = ""): HTMLElement {
  const fill = h("span", { class: "bar-fill" });
  fill.style.width = `${Math.max(2, Math.min(100, value))}%`;
  return h("div", { class: `bar-row ${cls}` }, [
    h("span", { class: "bar-label", text: label }),
    h("span", { class: "bar-track", attrs: { role: "img", "aria-label": `${label} ${value}%` } }, [fill]),
    h("span", { class: "bar-value", text: `${value}%` }),
  ]);
}

function renderResult(container: HTMLElement, v: ResultView, onRetry: () => void): void {
  container.replaceChildren();
  const species = settings.species;

  const bubble = h("div", { class: "bubble" }, [
    h("span", { class: "bubble-emoji", text: v.emoji, attrs: { "aria-hidden": "true" } }),
    h("div", { class: "bubble-body" }, [
      h("p", { class: "bubble-speaker", text: `${speakerName()}より` }),
      h("p", { class: "bubble-text", text: `「${v.phrase}」` }),
    ]),
  ]);

  const head = h("div", { class: "result-head" }, [
    h("span", { class: "result-label", text: v.label }),
    h("span", { class: "result-conf", text: `候補の中でのあてはまり度 ${v.confidence}%` }),
  ]);

  const others = v.others.length > 0
    ? h("div", { class: "result-block" }, [
        h("h3", { text: "ほかの可能性" }),
        ...v.others.map((o) => bar(`${o.emoji} ${o.label}`, o.confidence)),
      ])
    : null;

  const arousal = v.arousal !== null
    ? h("div", { class: "result-block" }, [h("h3", { text: "興奮度" }), bar(v.arousal >= 67 ? "高い" : v.arousal >= 34 ? "ふつう" : "落ち着いている", v.arousal, "arousal")])
    : null;

  const evidence = v.evidence.length > 0
    ? h("details", { class: "result-block evidence" }, [
        h("summary", { text: "判定のよりどころ" }),
        h("ul", {}, v.evidence.map((e) => h("li", { text: e }))),
        v.why ? h("p", { text: v.why }) : null,
      ])
    : null;

  const memo = h("input", { class: "memo-input", attrs: { type: "text", maxlength: "200", placeholder: "メモ（任意）：例 夕方、玄関のチャイムのあと" } });
  const saveBtn = h("button", { class: "btn btn-primary", text: "📔 記録する", attrs: { type: "button" } });
  const retryBtn = h("button", { class: "btn btn-ghost", text: v.kind === "voice" ? "もう一度聞く" : "選び直す", attrs: { type: "button" } });

  saveBtn.addEventListener("click", () => {
    const memoParsed = MemoSchema.safeParse(memo.value);
    if (!memoParsed.success) {
      toast(memoParsed.error.issues[0]?.message ?? "メモを確認してください");
      return;
    }
    const record = RecordSchema.safeParse({
      id: uuid(),
      createdAt: new Date().toISOString(),
      kind: v.kind,
      species,
      petName: settings.petName,
      meaningId: v.meaningId,
      label: v.label,
      emoji: v.emoji,
      phrase: v.phrase,
      confidence: v.confidence,
      arousal: v.arousal,
      context: v.kind === "voice" ? context : "none",
      memo: memoParsed.data,
    } satisfies Record<keyof HistoryRecord, unknown>);
    if (!record.success) {
      toast("記録できませんでした");
      return;
    }
    if (addRecord(record.data)) {
      toast("記録しました");
      saveBtn.disabled = true;
      saveBtn.textContent = "✓ 記録済み";
    } else {
      toast("保存領域がいっぱいで記録できませんでした");
    }
  });
  retryBtn.addEventListener("click", onRetry);

  const parts: Child[] = [
    bubble,
    head,
    v.note ? h("p", { class: "result-note", text: v.note }) : null,
    h("div", { class: "result-block advice" }, [h("h3", { text: "飼い主ができること" }), h("p", { text: v.advice })]),
    v.caution ? h("p", { class: "result-caution", text: `⚠️ ${v.caution}` }) : null,
    others,
    arousal,
    evidence,
    h("div", { class: "save-row" }, [memo]),
    h("div", { class: "row-actions" }, [retryBtn, saveBtn]),
  ];
  for (const p of parts) if (p) container.append(p);
  container.hidden = false;
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------- 鳴き声：録音 ---------------- */

const recordBtn = $<HTMLButtonElement>("#recordBtn");
const recordLabel = $("#recordLabel");
const recordTimer = $("#recordTimer");
const recordHint = $("#recordHint");
const scope = $<HTMLCanvasElement>("#scope");
const fileInput = $<HTMLInputElement>("#fileInput");
const voiceResult = $("#voiceResult");

let recording: Recording | null = null;
let rafId = 0;
let busy = false;

function drawIdleScope(): void {
  const ctx = scope.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, scope.width, scope.height);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--scope-idle").trim() || "#c4953f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, scope.height / 2);
  ctx.lineTo(scope.width, scope.height / 2);
  ctx.stroke();
}

function drawScope(analyser: AnalyserNode): void {
  const ctx = scope.getContext("2d");
  if (!ctx) return;
  const data = new Float32Array(analyser.fftSize);
  const color = getComputedStyle(document.documentElement).getPropertyValue("--scope-live").trim() || "#b03a2e";
  const loop = (): void => {
    if (!recording) return;
    analyser.getFloatTimeDomainData(data);
    ctx.clearRect(0, 0, scope.width, scope.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    const step = data.length / scope.width;
    for (let x = 0; x < scope.width; x++) {
      const v = data[Math.floor(x * step)] ?? 0;
      const y = scope.height / 2 - Math.max(-1, Math.min(1, v * 2.2)) * (scope.height / 2 - 4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const t = recording.elapsed();
    recordTimer.textContent = `${Math.min(t, MAX_RECORD_SEC).toFixed(1)} / ${MAX_RECORD_SEC.toFixed(1)} 秒`;
    if (t >= MAX_RECORD_SEC) {
      void finishRecording();
      return;
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function setRecordingUi(on: boolean): void {
  recordBtn.classList.toggle("recording", on);
  recordBtn.setAttribute("aria-pressed", String(on));
  recordLabel.textContent = on ? "止めて解析" : "録音する";
  recordHint.textContent = on ? "録音中… 鳴き声をマイクに近づけてください" : "鳴いたらボタンを押して、そのまま近づけて録音（最大6秒）";
}

function cancelRecording(): void {
  if (!recording) return;
  cancelAnimationFrame(rafId);
  recording.cancel();
  recording = null;
  setRecordingUi(false);
  drawIdleScope();
}

async function finishRecording(): Promise<void> {
  const rec = recording;
  if (!rec) return;
  recording = null;
  cancelAnimationFrame(rafId);
  setRecordingUi(false);
  recordBtn.disabled = true;
  try {
    const pcm = await rec.stop();
    if (pcm.samples.length < pcm.sampleRate * 0.4) {
      toast("短すぎます。もう少し長く録音してください");
      return;
    }
    analyzeAndShow(pcm);
  } finally {
    recordBtn.disabled = false;
    drawIdleScope();
  }
}

recordBtn.addEventListener("click", () => {
  if (busy) return;
  if (recording) {
    void finishRecording();
    return;
  }
  busy = true;
  startRecording("js/recorder-worklet.js")
    .then((rec) => {
      recording = rec;
      setRecordingUi(true);
      drawScope(rec.analyser);
    })
    .catch((err: unknown) => {
      toast(err instanceof AudioInputError ? err.message : "録音を開始できませんでした");
    })
    .finally(() => {
      busy = false;
    });
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  cancelRecording();
  recordHint.textContent = "読み込み中…";
  decodeFile(file)
    .then(analyzeAndShow)
    .catch((err: unknown) => toast(err instanceof AudioInputError ? err.message : "読み込めませんでした"))
    .finally(() => setRecordingUi(false));
});

function analyzeAndShow(pcm: Pcm): void {
  let features: Features;
  try {
    features = extractFeatures(pcm.samples, pcm.sampleRate);
  } catch (err: unknown) {
    if (err instanceof TooQuietError) {
      toast("鳴き声が聞き取れませんでした。もう少し近づけて録音してください");
    } else {
      toast("解析できませんでした");
    }
    return;
  }
  const species = settings.species;
  const result = interpretVoice(features, species, context);
  const [top, ...rest] = result.candidates;
  if (!top) return;
  const notes: string[] = [];
  if (result.uncertain) notes.push(`はっきりした特徴が見つからず、あいまいな推定です。${speciesName(species)}の鳴き声だけが入るように、静かな場所で近くから録音してみてください。`);
  if (context === "none") notes.push("「いまの状況」を選ぶと、より近い気持ちを選べます。");
  renderResult(voiceResult, {
    kind: "voice",
    meaningId: top.meaning.id,
    emoji: top.meaning.emoji,
    label: top.meaning.label,
    phrase: pickPhrase(top.meaning, features, context),
    confidence: top.confidence,
    others: rest.slice(0, 3).filter((c) => c.confidence >= 3).map((c) => ({ emoji: c.meaning.emoji, label: c.meaning.label, confidence: c.confidence })),
    arousal: result.arousal,
    evidence: result.evidence,
    why: top.meaning.why,
    advice: top.meaning.advice,
    caution: top.meaning.caution ?? null,
    note: notes.length > 0 ? notes.join(" ") : null,
  }, () => {
    voiceResult.hidden = true;
    recordBtn.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/* ---------------- しぐさ ---------------- */

const signalGroups = $("#signalGroups");
const bodyResult = $("#bodyResult");

function renderSignals(): void {
  signalGroups.replaceChildren();
  const byGroup = new Map<Signal["group"], Signal[]>();
  for (const s of signalsFor(settings.species)) {
    const list = byGroup.get(s.group) ?? [];
    list.push(s);
    byGroup.set(s.group, list);
  }
  for (const [group, list] of byGroup) {
    const chips = h("div", { class: "chips" });
    for (const s of list) {
      const chip = h("button", { class: "chip", text: s.label, attrs: { type: "button", "aria-pressed": "false", "data-signal": s.id } });
      chip.addEventListener("click", () => {
        if (selectedSignals.has(s.id)) selectedSignals.delete(s.id);
        else selectedSignals.add(s.id);
        chip.setAttribute("aria-pressed", String(selectedSignals.has(s.id)));
      });
      chips.append(chip);
    }
    signalGroups.append(h("fieldset", { class: "signal-group" }, [h("legend", { text: group }), chips]));
  }
}

$("#bodyResetBtn").addEventListener("click", () => {
  selectedSignals.clear();
  renderSignals();
  bodyResult.hidden = true;
});

$("#bodyBtn").addEventListener("click", () => {
  const result = interpretBody(settings.species, selectedSignals);
  const top = result?.candidates[0];
  if (!result || !top) {
    toast("しぐさを1つ以上選んでください");
    return;
  }
  renderResult(bodyResult, {
    kind: "body",
    meaningId: top.mood.id,
    emoji: top.mood.emoji,
    label: top.mood.label,
    phrase: top.mood.phrase,
    confidence: top.confidence,
    others: result.candidates.slice(1, 4).map((c) => ({ emoji: c.mood.emoji, label: c.mood.label, confidence: c.confidence })),
    arousal: null,
    evidence: signalsFor(settings.species).filter((s) => selectedSignals.has(s.id)).map((s) => `${s.group}：${s.label}`),
    why: null,
    advice: top.mood.advice,
    caution: null,
    note: result.mixed
      ? "うれしいサインと緊張のサインが混ざっています。気持ちが揺れているときは、無理に近づかず様子を見てあげましょう。"
      : selectedSignals.size < 3 ? "しぐさを3つ以上選ぶと、より確かになります。" : null,
  }, () => {
    selectedSignals.clear();
    renderSignals();
    bodyResult.hidden = true;
    signalGroups.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

/* ---------------- 記録 ---------------- */

const historyList = $("#historyList");
const historyEmpty = $("#historyEmpty");
const dateFmt = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const CONTEXT_TEXT = new Map<Context, string>(CONTEXT_LABELS);

function renderHistory(): void {
  const items = loadHistory();
  historyEmpty.hidden = items.length > 0;
  historyList.replaceChildren(
    ...items.map((r) => {
      const del = h("button", { class: "icon-btn small", text: "✕", attrs: { type: "button", "aria-label": "この記録を削除" } });
      del.addEventListener("click", () => {
        deleteRecord(r.id);
        renderHistory();
      });
      const meta = [
        dateFmt.format(new Date(r.createdAt)),
        `${r.species === "dog" ? "🐶" : "🐱"}${r.petName || speciesName(r.species)}`,
        r.kind === "voice" ? "鳴き声" : "しぐさ",
        r.context !== "none" ? CONTEXT_TEXT.get(r.context) ?? "" : "",
      ].filter(Boolean).join(" ・ ");
      return h("li", { class: "history-item" }, [
        h("span", { class: "history-emoji", text: r.emoji, attrs: { "aria-hidden": "true" } }),
        h("div", { class: "history-body" }, [
          h("p", { class: "history-phrase", text: `「${r.phrase}」` }),
          h("p", { class: "history-label", text: `${r.label}（${r.confidence}%）${r.arousal !== null ? ` 興奮度${r.arousal}` : ""}` }),
          h("p", { class: "history-meta", text: meta }),
          r.memo ? h("p", { class: "history-memo", text: r.memo }) : null,
        ]),
        del,
      ]);
    }),
  );
}

/* ---------------- 起動 ---------------- */

applySpecies();
drawIdleScope();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!recording) drawIdleScope();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => undefined);
  });
}
