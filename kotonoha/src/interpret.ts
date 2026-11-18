/* ===========================================================
   特徴量 → 気持ちの推定（ルールベース・DOM非依存）

   よりどころにしている主な研究知見（一般向けに要約）:
   - Morton (1977) 動機-構造ルール: 低く濁った声は威嚇・攻撃、高く澄んだ声は不安・なだめ・親和
   - Pongrácz ほか (2005, 2006) 犬の吠え声: 見知らぬ人への吠えは低く・ザラつき・間隔が短い。
     ひとりぼっちの吠えは高く・澄んで・間隔が長い。遊びの吠えは高め
   - Schötz ほか (2016-) 猫のニャー: 要求・前向きな場面では語尾が上がりやすく、
     動物病院などストレス場面では下がりやすい
   - Briefer (2012), Filippi ほか (2017): 多くの陸生脊椎動物で、声が高く・大きく・速くなるほど
     興奮（覚醒度）が高い傾向がある
   どれも「傾向」であり、個体差・犬種/猫種差・録音環境で大きく変わる。
   =========================================================== */
import type { Features } from "./analyzer.ts";
import type { Context, Species } from "./schemas.ts";

export interface Meaning {
  id: string;
  label: string;
  emoji: string;
  phrases: readonly string[];
  /** なぜそう考えられるか（行動学的な説明） */
  why: string;
  /** 飼い主ができること */
  advice: string;
  /** 注意書き（体調不良の可能性など） */
  caution?: string;
  /** 状況に合わせた言い回し（あればこちらを優先） */
  byContext?: Partial<Record<Context, string>>;
}

export interface Candidate {
  meaning: Meaning;
  /** 0..100 */
  confidence: number;
}

export interface VoiceResult {
  species: Species;
  candidates: Candidate[];
  /** 0..100 */
  arousal: number;
  /** 判定のよりどころ（人が読める文） */
  evidence: string[];
  /** どの候補も弱く、はっきりしないとき true */
  uncertain: boolean;
}

/* ---------------- ファジィ判定の部品 ---------------- */

/** x が a 以下で 0、b 以上で 1、その間は直線（a > b なら逆向き） */
export function up(x: number, a: number, b: number): number {
  if (a === b) return x >= b ? 1 : 0;
  const t = (x - a) / (b - a);
  return Math.max(0, Math.min(1, t));
}
/** x が a 以下で 1、b 以上で 0（a < b で指定する） */
const down = (x: number, a: number, b: number): number => 1 - up(x, a, b);
const between = (x: number, a: number, b: number, c: number, d: number): number =>
  Math.min(up(x, a, b), down(x, c, d));

/* ---------------- 犬 ---------------- */

const DOG: Record<string, Meaning> = {
  growl: {
    id: "dog-growl",
    label: "警告・近づかないで",
    emoji: "😠",
    phrases: ["それ以上近づかないで。本気だよ。", "これはボクのもの。触らないで！", "やめて。いやだって言ってるでしょ。"],
    why: "低く濁った長い「ウー」という声は、多くの動物で「自分を大きく見せる」威嚇のサインです。",
    advice: "無理に近づいたり叱ったりせず、原因（物・場所・触られ方）から距離をとってあげましょう。うなりは噛む前の大切な警告なので、うなること自体を叱らないのがポイントです。",
  },
  alert: {
    id: "dog-alert",
    byContext: { visitor: "誰か来た！知らない人だよ！", night: "暗くてあやしい音がする！" },
    label: "警戒・お知らせ",
    emoji: "🚨",
    phrases: ["誰か来た！みんな気をつけて！", "あやしい音がするよ！", "見張ってるからね、ワンワン！"],
    why: "短い吠えを速いテンポで繰り返し、声がやや低くザラつくのは、見知らぬ人や物音への警戒吠えに多い特徴です。",
    advice: "「教えてくれてありがとう」と落ち着いた声で伝え、外が見えにくいようにする・物音に慣らすなど、警戒のきっかけを減らしましょう。",
  },
  demand: {
    id: "dog-demand",
    byContext: { meal: "ねえ、ごはんまだ？早く早く！", play: "早く投げて！続きしようよ！", alone: "ねえ、こっちに来てよ！" },
    label: "要求・おねがい",
    emoji: "🙏",
    phrases: ["ねえ、ごはんまだ？", "こっち見て！かまって！", "早く散歩に行こうよ！"],
    why: "一定の間をあけて、やや高めの声で吠えを繰り返すのは、飼い主に何かを求めるときによく見られます。",
    advice: "吠えた直後に要求をかなえると「吠えれば叶う」と学習しやすくなります。静かになった瞬間に応えるのがコツです。",
  },
  play: {
    id: "dog-play",
    label: "遊ぼう・ワクワク",
    emoji: "🎾",
    phrases: ["ねえねえ、遊ぼうよ！", "もう一回投げて！", "楽しい〜！もっともっと！"],
    why: "高めの短い吠えが弾むように出るのは、遊びの誘いや興奮しているときに多い特徴です。",
    advice: "体の動き（プレイバウ・弾むような足取り）もそろっていれば遊びの誘いです。興奮しすぎたら一度休憩をはさみましょう。",
  },
  whine: {
    id: "dog-whine",
    byContext: { alone: "ひとりにしないで…早く帰ってきて", vet: "ここ、ちょっとこわいよ…", meal: "おなかすいたよ〜、まだ？" },
    label: "寂しい・不安・あまえ",
    emoji: "🥺",
    phrases: ["ひとりにしないで…", "こっちに来て、さみしいよ", "どうしよう、ちょっと不安…"],
    why: "高く澄んだ「クーン」「ピー」という声は、子犬が母犬を呼ぶ声に由来し、寂しさ・不安・要求を表すことが多いです。",
    advice: "留守番のたびに続く場合は分離不安の可能性も。短い外出から少しずつ慣らす練習や、獣医師・トレーナーへの相談を検討しましょう。",
  },
  yelp: {
    id: "dog-yelp",
    label: "痛い・びっくり",
    emoji: "😣",
    phrases: ["いたっ！", "うわっ、びっくりした！", "そこ、さわらないで…痛いの"],
    why: "突然の甲高く短い「キャン！」は、痛みや強い驚きに反射的に出る声です。",
    advice: "どこかを踏まれた・ぶつけたなど思い当たる原因がないか確認を。触ると鳴く場所がある、繰り返す場合は動物病院へ。",
    caution: "痛みのサインの可能性があります。繰り返す場合や元気がない場合は獣医師に相談してください。",
  },
  howl: {
    id: "dog-howl",
    label: "遠吠え・呼びかけ",
    emoji: "🌙",
    phrases: ["ここにいるよー！聞こえる？", "みんな、どこにいるの〜？", "サイレンの音…ボクも歌う！"],
    why: "長く伸びる澄んだ声は、離れた仲間に自分の居場所を知らせる遠吠えの特徴です。サイレンや楽器につられることもあります。",
    advice: "サイレンなどにつられた一時的なものなら心配いりません。留守中に続くようなら、寂しさのサインかもしれません。",
  },
};

function scoreDog(f: Features): Array<[Meaning, number]> {
  const P = f.pitchHz ?? 0;
  const voiced = f.pitchHz !== null;
  const short = down(f.meanBurstSec, 0.35, 0.7);
  const lowOrRough = Math.max(voiced ? down(P, 220, 380) : 1, down(f.tonality, 0.25, 0.55));

  const growl = up(f.meanBurstSec, 0.4, 1.0) * (0.5 * down(f.brightnessHz, 900, 1800) + 0.5 * lowOrRough);
  const alert = up(f.burstCount, 2, 4) * short * (0.3 + 0.4 * up(f.burstRate, 1.2, 3) + 0.3 * Math.max(down(P, 450, 800), up(f.noisiness, 0.08, 0.25)));
  const demand = up(f.burstCount, 2, 3) * short * between(f.burstRate, 0.3, 0.6, 1.8, 2.8) * (voiced ? up(P, 350, 600) : 0.3);
  const play = short * (voiced ? up(P, 420, 700) : 0.2) * (0.5 + 0.5 * up(f.burstCount, 1, 3)) * (0.6 + 0.4 * up(f.tonality, 0.3, 0.6));
  const whine = (voiced ? up(P, 550, 900) : 0) * up(f.tonality, 0.5, 0.8) * up(f.meanBurstSec, 0.2, 0.5) * (0.6 + 0.4 * down(f.peakDb, -20, -8));
  const yelp = (voiced ? up(P, 700, 1100) : 0) * down(f.meanBurstSec, 0.3, 0.6) * down(f.burstCount, 2, 4) * (0.5 + 0.5 * up(f.peakDb, -22, -8)) * (0.6 + 0.4 * up(-f.slopeSt, 0, 3));
  const howl = up(f.meanBurstSec, 0.9, 1.8) * up(f.tonality, 0.5, 0.8) * (voiced ? between(P, 200, 300, 1000, 1300) : 0);

  return [
    [DOG.growl as Meaning, growl],
    [DOG.alert as Meaning, alert],
    [DOG.demand as Meaning, demand],
    [DOG.play as Meaning, play],
    [DOG.whine as Meaning, whine],
    [DOG.yelp as Meaning, yelp],
    [DOG.howl as Meaning, howl],
  ];
}

/* ---------------- 猫 ---------------- */

const CAT: Record<string, Meaning> = {
  request: {
    id: "cat-request",
    byContext: { meal: "ごはんまだ？お願い！", touch: "もっとなでて！やめないで", alone: "どこ行ったの？早く来て〜", night: "ねえ起きて、かまってよ〜" },
    label: "要求・おねがい",
    emoji: "🍽️",
    phrases: ["ごはんまだ？お願い！", "ねえ、ドア開けて〜", "なでて！こっち来て！"],
    why: "はっきりした「ニャーオ」で語尾が上がるのは、人に何かを求めるときに多いパターンです。猫のニャーは主に人間向けに発達した声だと考えられています。",
    advice: "ごはん・トイレ・水・ドアなど、いつもと違う点がないか見てみましょう。夜中の要求鳴きには、応える時間を決めておくと落ち着きやすくなります。",
  },
  greet: {
    id: "cat-greet",
    label: "あいさつ・ごきげん",
    emoji: "👋",
    phrases: ["おかえり！", "あ、いたいた。ねえ、見て", "うん、聞いてるよ〜"],
    why: "短い「ニャッ」や喉を鳴らすような「プルル（トリル）」は、親しい相手へのあいさつや返事に使われます。",
    advice: "名前を呼んで返事が来たら、ゆっくりまばたきを返してあげると「好きだよ」のあいさつになります。",
  },
  complain: {
    id: "cat-complain",
    byContext: { vet: "やだなあ…ここから出して", touch: "そこはさわらないでほしいな…" },
    label: "不満・いやだ",
    emoji: "😾",
    phrases: ["やだなあ…ここから出して", "それ、気に入らない", "もう、ほっといてよ…"],
    why: "長めのニャーで語尾が下がるのは、動物病院やキャリーの中などストレスを感じる場面で多いと報告されています。",
    advice: "嫌がっていることを無理に続けず、隠れられる場所を用意しましょう。急にこの鳴き方が増えたら体調の変化も疑ってください。",
  },
  hiss: {
    id: "cat-hiss",
    label: "威嚇・来ないで",
    emoji: "🐍",
    phrases: ["来ないで！怒ってるよ！", "シャーッ！それ以上はダメ！", "こわい…近寄らないで！"],
    why: "音程のないザラザラした「シャー」は、ヘビの威嚇音に似た防御のための声で、恐怖と怒りが混ざった状態です。",
    advice: "目を合わせず、ゆっくり距離をとってください。落ち着くまでそっとしておくのが一番です。",
  },
  purr: {
    id: "cat-purr",
    byContext: { touch: "しあわせ〜、もっとなでて" },
    label: "安心・しあわせ",
    emoji: "😌",
    phrases: ["しあわせ〜、ここ最高", "安心してるよ。もっとなでて", "ずっとこうしていたいな"],
    why: "一定のリズムで続く低い「ゴロゴロ」は、くつろいで満ち足りているときの代表的な音です。",
    advice: "その調子でゆっくり過ごしましょう。",
    caution: "ゴロゴロは体調が悪いときや痛みがあるときに、自分を落ち着かせるために鳴らすこともあります。元気・食欲がない場合は獣医師に相談を。",
  },
  yowl: {
    id: "cat-yowl",
    label: "発情・縄張りの主張",
    emoji: "📣",
    phrases: ["ここはわたしの縄張り！", "恋の相手、募集中〜！", "外のあいつ、気に入らない！"],
    why: "大きく長く、音程がうねるように変わる「アオーン」は、発情期の呼び声やほかの猫への縄張り主張に多い声です。",
    advice: "未避妊・未去勢なら発情の可能性が高いです。窓の外の猫が原因なら、カーテンで視線をさえぎると落ち着くことがあります。シニア猫の夜鳴きは病気のサインのことも。",
    caution: "高齢の猫の急な夜鳴きは、甲状腺機能亢進症や認知機能の低下が原因のこともあります。",
  },
  chatter: {
    id: "cat-chatter",
    label: "狩りモード・ウズウズ",
    emoji: "🐦",
    phrases: ["あの鳥…つかまえたい…！", "カカカッ、届かない〜！", "ねらってるよ、あとちょっと…"],
    why: "窓の外の鳥などを見ながら出す、細かく速い「カカカッ」（クラッキング）は、狩りの興奮やもどかしさの表れと考えられています。",
    advice: "じゃらしで「捕まえる」ところまで遊ばせてあげると、狩りの欲求が満たされやすくなります。",
  },
  growl: {
    id: "cat-growl",
    label: "警告・ウーッ",
    emoji: "⚠️",
    phrases: ["ウーッ…それ以上はやめて", "触らないで、本気だよ", "このおもちゃはわたしの！"],
    why: "低く長い「ウーッ」は、我慢の限界が近いことを知らせる警告の声です。",
    advice: "触るのをやめ、距離をとりましょう。痛いところを触られて出る場合もあるので、場所を覚えておくと受診時の手がかりになります。",
  },
};

function scoreCat(f: Features): Array<[Meaning, number]> {
  const P = f.pitchHz ?? 0;
  const voiced = f.pitchHz !== null;
  const tonal = up(f.tonality, 0.45, 0.75);

  const request = tonal * between(f.meanBurstSec, 0.25, 0.45, 1.6, 2.2) * (0.45 + 0.55 * up(f.slopeSt, -0.5, 2));
  const greet = down(f.meanBurstSec, 0.28, 0.5) * up(f.tonality, 0.35, 0.65) * (0.6 + 0.4 * up(f.slopeSt, 0, 2)) * down(f.burstRate, 3.5, 6);
  const complain = tonal * up(f.meanBurstSec, 0.45, 0.9) * up(-f.slopeSt, 0.3, 3) * (0.6 + 0.4 * up(f.pitchRangeSt, 2, 6));
  const hiss = down(f.tonality, 0.15, 0.4) * up(f.noisiness, 0.12, 0.3) * up(f.brightnessHz, 1500, 2800) * up(f.meanBurstSec, 0.2, 0.4);
  const purr = up(f.purrLikeness, 0.25, 0.55) * up(f.meanBurstSec, 0.8, 1.5) * down(f.brightnessHz, 700, 1400);
  const yowl = up(f.meanBurstSec, 1.2, 2.2) * up(f.tonality, 0.4, 0.7) * (0.5 + 0.5 * up(f.pitchRangeSt, 3, 8)) * (0.5 + 0.5 * up(f.peakDb, -25, -10));
  const chatter = up(f.burstRate, 4, 7) * down(f.meanBurstSec, 0.12, 0.25) * up(f.burstCount, 4, 6);
  const growl = up(f.meanBurstSec, 0.6, 1.2) * down(f.brightnessHz, 900, 1600) * Math.max(voiced ? down(P, 200, 350) : 0, down(f.tonality, 0.25, 0.5)) * down(f.purrLikeness, 0.35, 0.6);

  return [
    [CAT.request as Meaning, request],
    [CAT.greet as Meaning, greet],
    [CAT.complain as Meaning, complain],
    [CAT.hiss as Meaning, hiss],
    [CAT.purr as Meaning, purr],
    [CAT.yowl as Meaning, yowl],
    [CAT.chatter as Meaning, chatter],
    [CAT.growl as Meaning, growl],
  ];
}

/* ---------------- 状況による重みづけ ---------------- */

const CONTEXT_BOOST: Record<Context, Record<string, number>> = {
  none: {},
  meal: { "dog-demand": 1.8, "dog-whine": 1.3, "dog-play": 1.1, "cat-request": 1.8, "cat-greet": 1.2 },
  visitor: { "dog-alert": 1.8, "dog-growl": 1.3, "cat-hiss": 1.5, "cat-growl": 1.4, "cat-complain": 1.2 },
  alone: { "dog-whine": 1.8, "dog-howl": 1.5, "dog-demand": 1.2, "cat-request": 1.4, "cat-yowl": 1.2 },
  play: { "dog-play": 1.8, "dog-demand": 1.2, "cat-chatter": 1.6, "cat-greet": 1.2 },
  vet: { "dog-whine": 1.5, "dog-yelp": 1.4, "dog-growl": 1.2, "cat-complain": 1.8, "cat-hiss": 1.4, "cat-growl": 1.3 },
  night: { "dog-howl": 1.4, "dog-alert": 1.2, "cat-yowl": 1.6, "cat-request": 1.2 },
  touch: { "cat-purr": 1.6, "cat-greet": 1.2, "cat-growl": 1.2, "dog-whine": 1.1, "dog-growl": 1.2 },
};

/* ---------------- 根拠の文章化 ---------------- */

function describe(f: Features, species: Species): string[] {
  const out: string[] = [];
  const base = species === "dog" ? 450 : 650;
  if (f.pitchHz !== null) {
    const rel = f.pitchHz < base * 0.6 ? "低め" : f.pitchHz > base * 1.5 ? "かなり高め" : f.pitchHz > base * 1.1 ? "高め" : "ふつう";
    out.push(`声の高さ：約${Math.round(f.pitchHz)}Hz（${species === "dog" ? "犬" : "猫"}としては${rel}）`);
  } else {
    out.push("声の高さ：音程がはっきりしない（雑音・息のような音）");
  }
  out.push(`鳴いた回数と長さ：${f.burstCount}回 × 1回あたり約${f.meanBurstSec.toFixed(2)}秒`);
  if (f.burstCount >= 3) out.push(`テンポ：1秒に約${f.burstRate.toFixed(1)}回`);
  if (f.pitchHz !== null) {
    const s = f.slopeSt;
    out.push(`語尾：${s > 1 ? "上がる ↗" : s < -1 ? "下がる ↘" : "ほぼ平ら →"}`);
  }
  out.push(`音色：${f.tonality > 0.6 ? "澄んだ声" : f.tonality > 0.3 ? "声と雑音が半々" : "ザラザラした雑音っぽい音"}`);
  out.push(`大きさ：${f.peakDb > -10 ? "大きい" : f.peakDb > -24 ? "ふつう" : "小さい"}`);
  if (f.purrLikeness > 0.4) out.push("規則的なうなり（ゴロゴロ音に近いリズム）を検出");
  return out;
}

function arousalOf(f: Features, species: Species): number {
  const base = species === "dog" ? 450 : 650;
  const pitchTerm = f.pitchHz !== null ? up(f.pitchHz / base, 0.6, 1.8) : 0.4;
  const v = 0.35 * pitchTerm
    + 0.3 * up(f.peakDb, -40, -8)
    + 0.25 * up(f.burstRate, 0.5, 4)
    + 0.1 * up(f.pitchRangeSt, 1, 8);
  return Math.round(100 * Math.max(0, Math.min(1, v)));
}

export function interpretVoice(f: Features, species: Species, context: Context): VoiceResult {
  const raw = species === "dog" ? scoreDog(f) : scoreCat(f);
  const boost = CONTEXT_BOOST[context];
  const scored = raw.map(([m, s]) => [m, (s + 0.03) * (boost[m.id] ?? 1)] as const);
  const weights = scored.map(([, s]) => s ** 1.6);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const candidates = scored
    .map(([meaning], i) => ({ meaning, confidence: Math.round((100 * (weights[i] ?? 0)) / total) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = Math.max(...raw.map(([, s]) => s));
  return {
    species,
    candidates,
    arousal: arousalOf(f, species),
    evidence: describe(f, species),
    uncertain: best < 0.15,
  };
}

/** 状況に合う言い回しがあればそれを、なければ同じ録音には同じ言い回しを返す */
export function pickPhrase(meaning: Meaning, f: Features, context: Context): string {
  const fixed = meaning.byContext?.[context];
  if (fixed) return fixed;
  const seed = Math.floor((f.pitchHz ?? 0) + f.activeSec * 1000 + f.burstCount * 7);
  return meaning.phrases[seed % meaning.phrases.length] ?? meaning.phrases[0] ?? "";
}
