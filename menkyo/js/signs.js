/* 免許みちしるべ — 道路標識データ（イラストはオリジナルの簡略図） */

window.MENKYO_SIGN_KINDS = [
  { key: "kisei",  label: "規制標識", note: "通行の禁止や制限を示します。円形や逆三角形が中心です。" },
  { key: "shiji",  label: "指示標識", note: "通行するうえで守るべきこと・決められたことを示します。青が基調です。" },
  { key: "keikai", label: "警戒標識", note: "この先の危険や注意すべき状況を知らせます。黄色のひし形です。" },
];

(() => {
  const RED = "#c8102e";
  const BLUE = "#0b5aa5";
  const INK = "#241f1b";
  const WHITE = "#fdfbf6";
  const YELLOW = "#f2c31d";

  /* 共通の下地 */
  const redTri =
    `<polygon points="60,113 2,13 118,13" fill="${RED}"/>` +
    `<polygon points="60,101 13,20 107,20" fill="none" stroke="${WHITE}" stroke-width="3.5"/>`;
  const whiteCircle =
    `<circle cx="60" cy="60" r="55" fill="${WHITE}"/><circle cx="60" cy="60" r="49" fill="none" stroke="${RED}" stroke-width="12"/>`;
  const blueCircle = `<circle cx="60" cy="60" r="55" fill="${BLUE}"/>`;
  const blueRedCircle =
    `<circle cx="60" cy="60" r="55" fill="${BLUE}"/><circle cx="60" cy="60" r="49" fill="none" stroke="${RED}" stroke-width="12"/>`;
  const diamond =
    `<polygon points="60,3 117,60 60,117 3,60" fill="${YELLOW}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  const blueSquare = `<rect x="6" y="6" width="108" height="108" rx="6" fill="${BLUE}"/>`;

  /* 部品 */
  const person = (x, y, s, color) =>
    `<g stroke="${color}" fill="${color}" stroke-width="${5 * s}" stroke-linecap="round">` +
    `<circle cx="${x}" cy="${y}" r="${6 * s}" stroke="none"/>` +
    `<path d="M${x} ${y + 8 * s} V${y + 26 * s}" fill="none"/>` +
    `<path d="M${x} ${y + 26 * s} L${x - 9 * s} ${y + 44 * s} M${x} ${y + 26 * s} L${x + 10 * s} ${y + 44 * s}" fill="none"/>` +
    `<path d="M${x} ${y + 13 * s} L${x - 11 * s} ${y + 22 * s} M${x} ${y + 13 * s} L${x + 11 * s} ${y + 20 * s}" fill="none"/>` +
    `</g>`;

  const stripes = (y, color) =>
    `<g fill="${color}">` +
    [22, 42, 62, 82].map((x) => `<rect x="${x}" y="${y}" width="12" height="9" rx="1.5"/>`).join("") +
    `</g>`;

  window.MENKYO_SIGNS = [
    /* ---------------- 規制標識 ---------------- */
    {
      id: "stop", kind: "kisei", name: "一時停止（止まれ）",
      desc: "停止線の直前（なければ交差点の直前）で必ず一時停止し、交差する道路の交通を妨げないようにします。見通しがよくても停止義務は変わりません。",
      svg: redTri +
        `<text x="60" y="52" text-anchor="middle" font-size="20" font-weight="700" fill="${WHITE}" font-family="sans-serif">止まれ</text>` +
        `<text x="60" y="73" text-anchor="middle" font-size="11" font-weight="700" fill="${WHITE}" font-family="sans-serif">STOP</text>`,
    },
    {
      id: "slow", kind: "kisei", name: "徐行",
      desc: "すぐに停止できる速度（おおむね時速10キロメートル以下）で進みます。時速30キロメートルは徐行になりません。",
      svg: redTri +
        `<text x="60" y="54" text-anchor="middle" font-size="24" font-weight="700" fill="${WHITE}" font-family="sans-serif">徐行</text>` +
        `<text x="60" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="${WHITE}" font-family="sans-serif">SLOW</text>`,
    },
    {
      id: "noentry", kind: "kisei", name: "車両進入禁止",
      desc: "この標識のある側から車は進入できません。一方通行の出口側などに立っています。逆走は正面衝突につながります。",
      svg: `<circle cx="60" cy="60" r="55" fill="${RED}"/><rect x="18" y="51" width="84" height="18" rx="3" fill="${WHITE}"/>`,
    },
    {
      id: "closed", kind: "kisei", name: "通行止め",
      desc: "歩行者・車両・路面電車のすべてが通行できません。車だけが対象の「車両通行止め」とは意味が異なります。",
      svg: whiteCircle +
        `<text x="60" y="68" text-anchor="middle" font-size="19" font-weight="700" fill="${INK}" font-family="sans-serif">通行止</text>`,
    },
    {
      id: "maxspeed", kind: "kisei", name: "最高速度",
      desc: "標識に示された速度を超えて運転してはいけません。原動機付自転車は、この数字が大きくても時速30キロメートルまでです。",
      svg: whiteCircle +
        `<text x="60" y="77" text-anchor="middle" font-size="46" font-weight="700" fill="${BLUE}" font-family="sans-serif">50</text>`,
    },
    {
      id: "minspeed", kind: "kisei", name: "最低速度",
      desc: "数字に下線が引かれているのが最低速度です。この速度に達しない速度で運転してはいけません（高速道路などで使われます）。",
      svg: whiteCircle +
        `<text x="60" y="74" text-anchor="middle" font-size="42" font-weight="700" fill="${BLUE}" font-family="sans-serif">50</text>` +
        `<rect x="34" y="79" width="52" height="6" rx="2" fill="${BLUE}"/>`,
    },
    {
      id: "nopark", kind: "kisei", name: "駐車禁止",
      desc: "駐車はできませんが、停車はできます。人の乗り降りのための停止は、時間に関係なく停車です。斜めの線は1本です。",
      svg: blueRedCircle +
        `<line x1="94" y1="26" x2="26" y2="94" stroke="${RED}" stroke-width="12" stroke-linecap="round"/>`,
    },
    {
      id: "nostop", kind: "kisei", name: "駐停車禁止",
      desc: "駐車も停車もできません。斜めの線が2本（×印）になっているのが目印です。",
      svg: blueRedCircle +
        `<line x1="94" y1="26" x2="26" y2="94" stroke="${RED}" stroke-width="12" stroke-linecap="round"/>` +
        `<line x1="26" y1="26" x2="94" y2="94" stroke="${RED}" stroke-width="12" stroke-linecap="round"/>`,
    },
    {
      id: "noturn", kind: "kisei", name: "転回禁止",
      desc: "Uターン（転回）が禁止されている場所です。標識のある区間では、交通が少なくても転回できません。",
      svg: whiteCircle +
        `<path d="M40 88 V56 a20 20 0 0 1 40 0 V74" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
        `<polygon points="80,90 70,72 90,72" fill="${INK}"/>` +
        `<line x1="92" y1="28" x2="28" y2="92" stroke="${RED}" stroke-width="10" stroke-linecap="round"/>`,
    },
    {
      id: "straightonly", kind: "kisei", name: "指定方向外進行禁止",
      desc: "矢印で示された方向以外へは進めません。図は直進のみができる例です。交差点の手前で早めに確認します。",
      svg: blueCircle +
        `<path d="M60 92 V38" stroke="${WHITE}" stroke-width="11" stroke-linecap="round"/>` +
        `<polygon points="60,22 42,46 78,46" fill="${WHITE}"/>`,
    },
    {
      id: "oneway", kind: "kisei", name: "一方通行",
      desc: "矢印の方向にだけ通行できます。対向車が来ないため、道路の右側部分にはみ出して通行することもできます。",
      svg: `<rect x="6" y="34" width="108" height="52" rx="6" fill="${BLUE}"/>` +
        `<path d="M22 60 H88" stroke="${WHITE}" stroke-width="10" stroke-linecap="round"/>` +
        `<polygon points="102,60 78,46 78,74" fill="${WHITE}"/>`,
    },
    {
      id: "notruck", kind: "kisei", name: "大型貨物自動車等通行止め",
      desc: "大型貨物自動車や特定中型貨物自動車、大型特殊自動車は通行できません。普通自動車は通行できます。",
      svg: whiteCircle +
        `<g fill="${INK}"><rect x="26" y="52" width="38" height="26" rx="3"/><path d="M64 62 h14 l12 12 v4 H64z"/>` +
        `</g><g fill="${WHITE}" stroke="${INK}" stroke-width="4"><circle cx="40" cy="82" r="7"/><circle cx="80" cy="82" r="7"/></g>`,
    },
    {
      id: "weight", kind: "kisei", name: "重量制限",
      desc: "総重量が標識の数値を超える車は通行できません。橋やトンネルの手前などに設置されます。",
      svg: whiteCircle +
        `<text x="60" y="74" text-anchor="middle" font-size="30" font-weight="700" fill="${INK}" font-family="sans-serif">5.5t</text>`,
    },
    {
      id: "height", kind: "kisei", name: "高さ制限",
      desc: "地上から標識の数値を超える高さの車（荷物を含む）は通行できません。高架やトンネルの手前で確認します。",
      svg: whiteCircle +
        `<text x="60" y="72" text-anchor="middle" font-size="26" font-weight="700" fill="${INK}" font-family="sans-serif">3.3m</text>` +
        `<g fill="${INK}"><polygon points="60,30 52,42 68,42"/><polygon points="60,92 52,80 68,80"/></g>`,
    },
    {
      id: "nocross", kind: "kisei", name: "車両横断禁止",
      desc: "道路の右側の施設に入るための横断（右折して道路を横切ること）が禁止されています。左折して入ることはできます。",
      svg: whiteCircle +
        `<path d="M44 92 V60 H78" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<polygon points="94,60 74,48 74,72" fill="${INK}"/>` +
        `<line x1="92" y1="28" x2="28" y2="92" stroke="${RED}" stroke-width="10" stroke-linecap="round"/>`,
    },
    {
      id: "pedonly", kind: "kisei", name: "歩行者専用",
      desc: "歩行者だけが通行できる道路です。許可を受けた車が通るときは、徐行して歩行者に十分注意します。",
      svg: blueCircle + person(46, 30, 0.95, WHITE) + person(76, 44, 0.7, WHITE),
    },
    {
      id: "bikeonly", kind: "kisei", name: "自転車専用",
      desc: "普通自転車だけが通行できる道路（自転車道）です。自動車や原動機付自転車は通行できません。",
      svg: blueCircle +
        `<g fill="none" stroke="${WHITE}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">` +
        `<circle cx="34" cy="76" r="15"/><circle cx="86" cy="76" r="15"/>` +
        `<path d="M34 76 L52 50 H70 L86 76 M52 50 L66 76 M66 44 H76"/>` +
        `<path d="M44 44 h12"/></g>` +
        `<circle cx="72" cy="32" r="7" fill="${WHITE}"/>`,
    },
    {
      id: "pedbike", kind: "kisei", name: "自転車及び歩行者専用",
      desc: "歩行者と自転車が通行できる道路です。自転車は歩行者優先で、車道寄りを徐行します。",
      svg: blueCircle +
        `<g fill="none" stroke="${WHITE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">` +
        `<circle cx="30" cy="82" r="11"/><circle cx="66" cy="82" r="11"/>` +
        `<path d="M30 82 L44 62 H56 L66 82 M44 62 L54 82 M54 58 H62"/></g>` +
        person(92, 30, 0.62, WHITE) + person(76, 24, 0.55, WHITE),
    },

    /* ---------------- 指示標識 ---------------- */
    {
      id: "crosswalk", kind: "shiji", name: "横断歩道",
      desc: "横断歩道があることを示します。歩行者が渡ろうとしているときは、直前で一時停止しなければなりません。手前30メートル以内は追い越し・追い抜き禁止です。",
      svg: `<polygon points="60,3 116,32 116,117 4,117 4,32" fill="${BLUE}"/>` +
        person(60, 30, 0.85, WHITE) + stripes(96, WHITE),
    },
    {
      id: "parkok", kind: "shiji", name: "駐車可",
      desc: "駐車できる場所であることを示します。補助標識で時間や車種が限定されていることがあります。",
      svg: blueSquare +
        `<text x="60" y="86" text-anchor="middle" font-size="72" font-weight="700" fill="${WHITE}" font-family="sans-serif">P</text>`,
    },
    {
      id: "priority", kind: "shiji", name: "優先道路",
      desc: "この標識のある道路が優先道路です。優先道路を通行しているときは、交差点の手前30メートル以内でも追い越しができます。",
      svg: blueSquare +
        `<g fill="${WHITE}"><rect x="50" y="16" width="20" height="88" rx="2"/><rect x="16" y="54" width="88" height="8" rx="2"/></g>`,
    },

    /* ---------------- 警戒標識 ---------------- */
    {
      id: "railway", kind: "keikai", name: "踏切あり",
      desc: "この先に踏切があります。直前で一時停止し、目と耳で安全を確かめてから、変速しないで一気に通過します。",
      svg: diamond +
        `<g fill="${INK}"><rect x="26" y="56" width="52" height="20" rx="3"/><rect x="26" y="42" width="22" height="16" rx="3"/>` +
        `<rect x="70" y="40" width="9" height="18" rx="2"/><rect x="22" y="76" width="62" height="6" rx="2"/></g>` +
        `<g fill="none" stroke="${INK}" stroke-width="5"><circle cx="38" cy="88" r="6"/><circle cx="58" cy="88" r="6"/><circle cx="76" cy="88" r="6"/></g>`,
    },
    {
      id: "school", kind: "keikai", name: "学校、幼稚園、保育所等あり",
      desc: "子どもの飛び出しに注意が必要な場所です。速度を落とし、いつでも止まれる心構えで通行します。",
      svg: diamond + person(44, 36, 0.78, INK) + person(76, 44, 0.66, INK),
    },
    {
      id: "crosswalkahead", kind: "keikai", name: "横断歩道あり",
      desc: "この先に横断歩道があることを知らせます。歩行者を見落とさないよう、あらかじめ速度を落とします。",
      svg: diamond + person(58, 28, 0.8, INK) +
        `<g fill="${INK}"><rect x="26" y="88" width="12" height="8" rx="1.5"/><rect x="44" y="88" width="12" height="8" rx="1.5"/>` +
        `<rect x="62" y="88" width="12" height="8" rx="1.5"/><rect x="80" y="88" width="12" height="8" rx="1.5"/></g>`,
    },
    {
      id: "signal", kind: "keikai", name: "信号機あり",
      desc: "この先に信号機があります。見通しの悪い場所やカーブの先の信号を、あらかじめ知らせるものです。",
      svg: diamond +
        `<rect x="44" y="22" width="32" height="72" rx="8" fill="${INK}"/>` +
        `<circle cx="60" cy="40" r="9" fill="#e04a3a"/><circle cx="60" cy="58" r="9" fill="${YELLOW}"/><circle cx="60" cy="76" r="9" fill="#4c9a6a"/>`,
    },
    {
      id: "curve", kind: "keikai", name: "右方屈曲あり",
      desc: "この先で道路が右に曲がっています。カーブの手前で十分に減速し、対向車のはみ出しにも注意します。",
      svg: diamond +
        `<path d="M46 100 V56 H82" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<polygon points="98,56 76,44 76,68" fill="${INK}"/>`,
    },
    {
      id: "narrow", kind: "keikai", name: "幅員減少",
      desc: "この先で道路の幅が狭くなります。対向車とのすれ違いに注意し、無理な追い越しをしないようにします。",
      svg: diamond +
        `<g fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round">` +
        `<path d="M34 96 L48 38"/><path d="M86 96 L72 38"/></g>`,
    },
    {
      id: "slippery", kind: "keikai", name: "すべりやすい",
      desc: "路面がすべりやすい場所です。急ハンドル・急ブレーキ・急加速を避け、速度を落として通行します。",
      svg: diamond +
        `<g fill="${INK}"><path d="M32 56 h40 l12 14 h6 v14 H32z" /></g>` +
        `<g fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round">` +
        `<path d="M30 96 q8 -8 16 0 q8 8 16 0"/><path d="M64 96 q8 -8 16 0"/></g>` +
        `<g fill="${YELLOW}" stroke="${INK}" stroke-width="3"><circle cx="44" cy="84" r="6"/><circle cx="78" cy="84" r="6"/></g>`,
    },
    {
      id: "rockfall", kind: "keikai", name: "落石のおそれあり",
      desc: "落石や崩れた土砂があるおそれのある場所です。路上の障害物に注意し、路肩に寄りすぎないようにします。",
      svg: diamond +
        `<path d="M86 24 L96 96 H62 z" fill="${INK}"/>` +
        `<g fill="${INK}"><circle cx="48" cy="52" r="8"/><circle cx="34" cy="76" r="6"/><circle cx="52" cy="88" r="10"/></g>`,
    },
    {
      id: "animal", kind: "keikai", name: "動物が飛び出すおそれあり",
      desc: "動物が道路に飛び出すおそれがある場所です。特に夜間は速度を落とし、路肩の動きに注意します。",
      svg: diamond +
        `<g fill="${INK}"><ellipse cx="56" cy="60" rx="24" ry="13"/><path d="M76 54 l14 -10 6 6 -12 12z"/>` +
        `<path d="M84 44 l-6 -14 4 -1 6 12z"/><path d="M92 42 l6 -13 4 2 -6 13z"/></g>` +
        `<g stroke="${INK}" stroke-width="6" stroke-linecap="round"><path d="M40 70 V92"/><path d="M52 70 V92"/><path d="M66 70 V92"/><path d="M74 68 V92"/></g>`,
    },
    {
      id: "otherdanger", kind: "keikai", name: "その他の危険",
      desc: "ほかの警戒標識で表せない危険があることを示します。補助標識に危険の内容が書かれていることがあります。",
      svg: diamond +
        `<g fill="${INK}"><rect x="52" y="26" width="16" height="46" rx="7"/><circle cx="60" cy="88" r="9"/></g>`,
    },
  ];
})();
