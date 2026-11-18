/* ===========================================================
   しぐさ（ボディランゲージ）から気持ちを読む
   鳴き声よりも、しぐさの組み合わせのほうが気持ちを正確に表すことが多い。
   =========================================================== */
import type { Species } from "./schemas.ts";

export interface Mood {
  id: string;
  label: string;
  emoji: string;
  phrase: string;
  advice: string;
}

export interface Signal {
  id: string;
  label: string;
  group: "しっぽ" | "耳" | "目・顔" | "体・行動";
  weights: Readonly<Record<string, number>>;
}

export interface BodyResult {
  candidates: Array<{ mood: Mood; confidence: number }>;
  /** 相反するサインが混ざっているとき（例：しっぽは振っているが体がこわばる） */
  mixed: boolean;
}

const DOG_MOODS: readonly Mood[] = [
  { id: "dog-happy", label: "うれしい・リラックス", emoji: "😊", phrase: "いい気分！そばにいてくれてうれしいな", advice: "今の過ごし方で大丈夫。やさしく声をかけてあげましょう。" },
  { id: "dog-play", label: "遊ぼう", emoji: "🎾", phrase: "ねえ、遊ぼうよ！追いかけっこしよう！", advice: "短い遊びに付き合ってあげると満足度が上がります。興奮しすぎたら休憩を。" },
  { id: "dog-anxious", label: "不安・ストレス", emoji: "😟", phrase: "ちょっと落ち着かないな…", advice: "苦手なもの（音・人・場所）から少し離し、静かに落ち着ける時間を作りましょう。" },
  { id: "dog-fear", label: "こわい", emoji: "😨", phrase: "こわいよ…近づかないで", advice: "無理に触ったり近づけたりせず、逃げ場を確保してあげてください。" },
  { id: "dog-alert", label: "気になる・警戒", emoji: "👀", phrase: "ん？あれは何だろう…", advice: "何に注目しているか確認し、落ち着いた声で安心させましょう。" },
  { id: "dog-angry", label: "怒り・近づかないで", emoji: "😠", phrase: "それ以上来たら怒るよ", advice: "目を合わせず、ゆっくり距離をとってください。噛みつきの危険があります。" },
  { id: "dog-appease", label: "なだめ・敵意はないよ", emoji: "🙇", phrase: "けんかする気はないよ、落ち着いて", advice: "相手（人や犬）との緊張をやわらげようとしています。叱らず、場を落ち着かせて。" },
];

const DOG_SIGNALS: readonly Signal[] = [
  { id: "d-tail-loose", group: "しっぽ", label: "腰ごと大きくゆったり振る", weights: { "dog-happy": 3, "dog-play": 1 } },
  { id: "d-tail-high", group: "しっぽ", label: "高く上げて固く小刻みに振る", weights: { "dog-alert": 2, "dog-angry": 2 } },
  { id: "d-tail-low-wag", group: "しっぽ", label: "低い位置で小刻みに振る", weights: { "dog-appease": 2, "dog-anxious": 1 } },
  { id: "d-tail-tucked", group: "しっぽ", label: "股の間に巻き込む", weights: { "dog-fear": 3, "dog-anxious": 1 } },
  { id: "d-tail-neutral", group: "しっぽ", label: "自然に垂れている", weights: { "dog-happy": 1 } },
  { id: "d-ears-forward", group: "耳", label: "前に向けてピンと立てる", weights: { "dog-alert": 2, "dog-play": 1 } },
  { id: "d-ears-back", group: "耳", label: "後ろにぴったり倒す", weights: { "dog-fear": 2, "dog-appease": 1, "dog-anxious": 1 } },
  { id: "d-ears-relaxed", group: "耳", label: "力が抜けている", weights: { "dog-happy": 2 } },
  { id: "d-whale-eye", group: "目・顔", label: "顔をそむけつつ白目が見える", weights: { "dog-anxious": 2, "dog-fear": 2 } },
  { id: "d-soft-eyes", group: "目・顔", label: "目が細くやわらかい", weights: { "dog-happy": 2 } },
  { id: "d-stare", group: "目・顔", label: "じっと固く見つめる", weights: { "dog-angry": 2, "dog-alert": 1 } },
  { id: "d-teeth", group: "目・顔", label: "鼻にしわを寄せて歯を見せる", weights: { "dog-angry": 4 } },
  { id: "d-lip-lick", group: "目・顔", label: "口や鼻をペロッとなめる", weights: { "dog-anxious": 2, "dog-appease": 1 } },
  { id: "d-yawn", group: "目・顔", label: "眠くないのにあくび", weights: { "dog-anxious": 2, "dog-appease": 1 } },
  { id: "d-smile", group: "目・顔", label: "口を開けて笑ったような顔", weights: { "dog-happy": 2, "dog-play": 1 } },
  { id: "d-play-bow", group: "体・行動", label: "お尻を上げて前足を伏せる", weights: { "dog-play": 4 } },
  { id: "d-bouncy", group: "体・行動", label: "ぴょんぴょん弾むように動く", weights: { "dog-play": 3 } },
  { id: "d-belly", group: "体・行動", label: "お腹を見せて転がる", weights: { "dog-appease": 2, "dog-happy": 1 } },
  { id: "d-hackles", group: "体・行動", label: "背中の毛が逆立つ", weights: { "dog-alert": 2, "dog-angry": 1, "dog-fear": 1 } },
  { id: "d-freeze", group: "体・行動", label: "体がこわばって動きが止まる", weights: { "dog-angry": 2, "dog-fear": 1 } },
  { id: "d-low", group: "体・行動", label: "体を低くして縮こまる", weights: { "dog-fear": 2, "dog-appease": 1 } },
  { id: "d-shake", group: "体・行動", label: "濡れていないのに体をブルブル振る", weights: { "dog-anxious": 1, "dog-happy": 1 } },
  { id: "d-turn-away", group: "体・行動", label: "顔や体をそむける", weights: { "dog-appease": 2, "dog-anxious": 1 } },
  { id: "d-lean", group: "体・行動", label: "体をくっつけてくる", weights: { "dog-happy": 2 } },
];

const CAT_MOODS: readonly Mood[] = [
  { id: "cat-love", label: "甘え・大好き", emoji: "😻", phrase: "あなたのこと、好きだよ", advice: "ゆっくりまばたきを返したり、好きな場所をなでてあげましょう。" },
  { id: "cat-relaxed", label: "のんびり・安心", emoji: "😌", phrase: "ここは安心。ちょっとひと眠り…", advice: "そっとしておいてあげるのが一番のプレゼントです。" },
  { id: "cat-play", label: "遊び・狩りモード", emoji: "🐾", phrase: "ねらった獲物は逃さない…！", advice: "じゃらしで思い切り遊ばせ、最後は「捕まえさせて」終わりましょう。" },
  { id: "cat-curious", label: "気になる・興味しんしん", emoji: "🧐", phrase: "なになに？それ、なあに？", advice: "安全なものならにおいを嗅がせて、ゆっくり確かめさせてあげましょう。" },
  { id: "cat-irritated", label: "イライラ・もうやめて", emoji: "😒", phrase: "ちょっと、もう十分なんだけど", advice: "なでるのをやめるサインです。続けると噛んだり引っかいたりすることがあります。" },
  { id: "cat-fear", label: "こわい", emoji: "🙀", phrase: "こわい…どこかに隠れたい", advice: "隠れ場所を用意し、無理に引っ張り出さないでください。" },
  { id: "cat-angry", label: "威嚇・近づかないで", emoji: "😾", phrase: "それ以上近づいたら許さない！", advice: "目を合わせず静かに離れてください。落ち着くまで時間をおきましょう。" },
];

const CAT_SIGNALS: readonly Signal[] = [
  { id: "c-tail-up", group: "しっぽ", label: "ピンと垂直に立てる", weights: { "cat-love": 3 } },
  { id: "c-tail-hook", group: "しっぽ", label: "立てたしっぽの先が「?」の形", weights: { "cat-love": 1, "cat-curious": 2, "cat-play": 1 } },
  { id: "c-tail-thrash", group: "しっぽ", label: "バタン、バタンと強く振る", weights: { "cat-irritated": 3 } },
  { id: "c-tail-puff", group: "しっぽ", label: "太く膨らむ", weights: { "cat-fear": 2, "cat-angry": 2 } },
  { id: "c-tail-tip", group: "しっぽ", label: "先だけピクピク動く", weights: { "cat-curious": 2, "cat-play": 1 } },
  { id: "c-tail-low", group: "しっぽ", label: "低く下げる・股に挟む", weights: { "cat-fear": 3 } },
  { id: "c-tail-wrap", group: "しっぽ", label: "体に巻きつけて座る", weights: { "cat-relaxed": 2 } },
  { id: "c-ears-forward", group: "耳", label: "前向きに立っている", weights: { "cat-curious": 2, "cat-relaxed": 1 } },
  { id: "c-ears-side", group: "耳", label: "横に倒れる（イカ耳）", weights: { "cat-irritated": 2, "cat-fear": 1 } },
  { id: "c-ears-flat", group: "耳", label: "後ろにぺたんと伏せる", weights: { "cat-fear": 2, "cat-angry": 2 } },
  { id: "c-ears-swivel", group: "耳", label: "あちこちに動かす", weights: { "cat-curious": 2 } },
  { id: "c-slow-blink", group: "目・顔", label: "ゆっくりまばたきする", weights: { "cat-love": 3, "cat-relaxed": 1 } },
  { id: "c-half-closed", group: "目・顔", label: "目を半分閉じている", weights: { "cat-relaxed": 3 } },
  { id: "c-pupils-wide", group: "目・顔", label: "暗くないのに瞳孔がまんまる", weights: { "cat-play": 2, "cat-fear": 1, "cat-curious": 1 } },
  { id: "c-stare", group: "目・顔", label: "じっと見つめて動かない", weights: { "cat-curious": 1, "cat-angry": 1, "cat-play": 1 } },
  { id: "c-whiskers-fwd", group: "目・顔", label: "ヒゲが前に張り出す", weights: { "cat-curious": 2, "cat-play": 1 } },
  { id: "c-whiskers-back", group: "目・顔", label: "ヒゲを顔にぴったり寄せる", weights: { "cat-fear": 2 } },
  { id: "c-head-bump", group: "体・行動", label: "頭や顔をこすりつける", weights: { "cat-love": 3 } },
  { id: "c-knead", group: "体・行動", label: "前足でふみふみする", weights: { "cat-love": 2, "cat-relaxed": 2 } },
  { id: "c-belly", group: "体・行動", label: "お腹を見せてゴロンとする", weights: { "cat-relaxed": 2, "cat-love": 1 } },
  { id: "c-loaf", group: "体・行動", label: "前足をしまって座る（香箱座り）", weights: { "cat-relaxed": 3 } },
  { id: "c-wiggle", group: "体・行動", label: "体を低くしてお尻をふりふり", weights: { "cat-play": 4 } },
  { id: "c-arch", group: "体・行動", label: "背中を丸めて横向きに立つ", weights: { "cat-fear": 2, "cat-angry": 2 } },
  { id: "c-ripple", group: "体・行動", label: "背中の皮がピクピク波打つ", weights: { "cat-irritated": 2 } },
  { id: "c-hide", group: "体・行動", label: "隠れて出てこない", weights: { "cat-fear": 3 } },
  { id: "c-groom", group: "体・行動", label: "急に毛づくろいを始める", weights: { "cat-irritated": 1, "cat-fear": 1 } },
];

export function moodsFor(species: Species): readonly Mood[] {
  return species === "dog" ? DOG_MOODS : CAT_MOODS;
}

export function signalsFor(species: Species): readonly Signal[] {
  return species === "dog" ? DOG_SIGNALS : CAT_SIGNALS;
}

const POSITIVE = new Set(["dog-happy", "dog-play", "cat-love", "cat-relaxed", "cat-play"]);
const NEGATIVE = new Set(["dog-fear", "dog-angry", "dog-anxious", "cat-fear", "cat-angry", "cat-irritated"]);

export function interpretBody(species: Species, selected: ReadonlySet<string>): BodyResult | null {
  const signals = signalsFor(species).filter((s) => selected.has(s.id));
  if (signals.length === 0) return null;
  const totals = new Map<string, number>();
  for (const s of signals) {
    for (const [mood, w] of Object.entries(s.weights)) totals.set(mood, (totals.get(mood) ?? 0) + w);
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  const candidates = moodsFor(species)
    .map((mood) => ({ mood, confidence: Math.round((100 * (totals.get(mood.id) ?? 0)) / sum) }))
    .filter((c) => c.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
  let pos = 0;
  let neg = 0;
  for (const [id, v] of totals) {
    if (POSITIVE.has(id)) pos += v;
    if (NEGATIVE.has(id)) neg += v;
  }
  return { candidates, mixed: pos >= 2 && neg >= 2 };
}
