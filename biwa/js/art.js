// オリジナルの絵：金地・桜・琵琶・襲（かさね）色。すべてSVGとCSSで描く。

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PETAL = "M0,0 C-7,-5 -10,-15 -6,-22 L0,-18.5 L6,-22 C10,-15 7,-5 0,0Z";

function flowerDefs(id, fill, edge) {
  return `<g id="${id}">
    ${[0, 72, 144, 216, 288].map((r) => `<path d="${PETAL}" transform="rotate(${r})" fill="${fill}" stroke="${edge}" stroke-width="0.8"/>`).join("")}
    <circle r="3.4" fill="#f7e7a8"/>
    ${[0, 72, 144, 216, 288].map((r) => `<line x1="0" y1="0" x2="0" y2="-7" transform="rotate(${r + 36})" stroke="#c2465a" stroke-width="0.9"/><circle cx="0" cy="-7.6" r="1.1" transform="rotate(${r + 36})" fill="#c2465a"/>`).join("")}
  </g>`;
}

/** 本棚の上に飾る絵：金屏風に桜、琵琶と撥、十二単の襲の色 */
export function heroSVG() {
  const blossoms = [
    [262, 26, 0.95, 10], [300, 48, 0.8, 40], [236, 58, 0.7, -20], [330, 20, 0.75, 15], [208, 30, 0.6, 33],
    [342, 78, 0.65, -12], [276, 86, 0.55, 22], [184, 64, 0.5, 5], [318, 112, 0.5, 48],
  ];
  const buds = [[222, 18], [290, 14], [352, 52], [250, 96], [196, 48]];
  const petals = [[120, 70, 30], [96, 140, -40], [160, 210, 70], [60, 220, 12], [318, 200, -24], [140, 32, 60]];
  return `
<svg viewBox="0 0 360 260" preserveAspectRatio="xMaxYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="金地に桜と琵琶の絵">
  <defs>
    <radialGradient id="gGold" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#f6e6ad"/>
      <stop offset="0.55" stop-color="#e9cd82"/>
      <stop offset="1" stop-color="#d4ad5c"/>
    </radialGradient>
    <linearGradient id="gWood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b98447"/>
      <stop offset="0.6" stop-color="#8d5a2b"/>
      <stop offset="1" stop-color="#5e3a1c"/>
    </linearGradient>
    <linearGradient id="gBachi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbf3dc"/>
      <stop offset="1" stop-color="#e2d2a6"/>
    </linearGradient>
    <filter id="fPaper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.32  0 0 0 0 0.12  0 0 0 0.10 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="fSoft"><feGaussianBlur stdDeviation="0.4"/></filter>
    <clipPath id="cBody"><path d="M0,-40 C30,-38 52,0 52,50 C52,100 28,125 0,125 C-28,125 -52,100 -52,50 C-52,0 -30,-38 0,-40Z"/></clipPath>
    ${flowerDefs("fl", "#fbd9df", "#e89aab")}
  </defs>

  <rect width="360" height="260" fill="url(#gGold)"/>
  <rect width="360" height="260" fill="#000" filter="url(#fPaper)" opacity="0.9"/>
  <!-- 金箔の継ぎ目 -->
  <g stroke="#c79c4c" stroke-opacity="0.35" stroke-width="0.8">
    <line x1="0" y1="86" x2="360" y2="86"/><line x1="0" y1="172" x2="360" y2="172"/>
    <line x1="90" y1="0" x2="90" y2="86"/><line x1="210" y1="86" x2="210" y2="172"/><line x1="130" y1="172" x2="130" y2="260"/>
  </g>
  <!-- 金雲 -->
  <path d="M-10,214 C30,196 60,206 90,198 C126,188 150,206 190,200 C230,194 250,210 300,204 C330,200 350,212 370,208 L370,260 L-10,260Z" fill="#dcb963" opacity="0.7"/>

  <!-- 桜の枝 -->
  <g fill="none" stroke-linecap="round">
    <path d="M372,6 C340,18 312,26 288,40 C262,55 238,52 214,44" stroke="#4a3223" stroke-width="7"/>
    <path d="M288,40 C296,62 312,80 330,104" stroke="#4a3223" stroke-width="4.5"/>
    <path d="M250,48 C240,30 226,22 206,24" stroke="#4a3223" stroke-width="3.5"/>
    <path d="M214,44 C200,52 190,60 178,64" stroke="#4a3223" stroke-width="3"/>
    <path d="M330,104 C340,110 346,120 350,132" stroke="#4a3223" stroke-width="2.4"/>
    <path d="M300,30 C304,18 300,10 292,4" stroke="#4a3223" stroke-width="2.4"/>
    <path d="M372,6 C340,18 312,26 288,40" stroke="#7b5a3e" stroke-width="2" stroke-opacity="0.6" transform="translate(-1,-2)"/>
  </g>
  ${buds.map(([x, y]) => `<g transform="translate(${x},${y})"><ellipse rx="3.4" ry="5" fill="#f0a1b3" stroke="#c2465a" stroke-width="0.6"/><path d="M-3,3 L0,7 L3,3" fill="#6e8a4a"/></g>`).join("")}
  ${blossoms.map(([x, y, s, r]) => `<use href="#fl" transform="translate(${x},${y}) rotate(${r}) scale(${s})"/>`).join("")}

  <!-- 襲の色の衣（十二単の袖のかさなり） -->
  <g>
    <path d="M-10,262 C10,214 44,196 84,200 C112,203 120,226 150,232 C176,237 196,226 210,262Z" fill="#b8a3c8"/>
    <path d="M-10,262 C8,226 38,212 72,214 C100,216 112,238 140,244 C160,248 180,244 192,262Z" fill="#cf5a3e"/>
    <path d="M-10,262 C6,238 30,228 58,229 C86,230 100,248 124,252 C140,255 156,254 168,262Z" fill="#6f9a72"/>
    <path d="M-10,262 C4,248 22,242 44,243 C66,244 80,256 96,262Z" fill="#2c2522"/>
    <path d="M30,212 C46,222 52,236 50,250" stroke="#2c2522" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M104,206 C120,214 128,228 126,244" stroke="#2c2522" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.55"/>
  </g>

  <!-- 琵琶 -->
  <g transform="translate(252,150) rotate(-30) scale(0.82)">
    <path d="M-7,-38 L-5,-96 L5,-96 L7,-38Z" fill="#6b4422"/>
    <path d="M-5,-96 L5,-96 L15,-132 L5,-135Z" fill="#4e301a"/>
    ${[-104, -112, -120, -128].map((y, i) => `<line x1="${i % 2 ? 2 : -14}" y1="${y}" x2="${i % 2 ? 20 : 4}" y2="${y + 2}" stroke="#2b1a0e" stroke-width="3" stroke-linecap="round" transform="rotate(${i * 2} 5 ${y})"/>`).join("")}
    <path d="M0,-40 C30,-38 52,0 52,50 C52,100 28,125 0,125 C-28,125 -52,100 -52,50 C-52,0 -30,-38 0,-40Z" fill="url(#gWood)" stroke="#3b2412" stroke-width="2"/>
    <g clip-path="url(#cBody)">
      <path d="M-60,30 L60,52 L60,86 L-60,64Z" fill="#231c19"/>
      <use href="#fl" transform="translate(-16,52) scale(0.42)"/>
      <use href="#fl" transform="translate(18,62) scale(0.32) rotate(20)"/>
      <path d="M-60,30 L60,52" stroke="#c79c4c" stroke-width="1.4"/>
      <path d="M-60,64 L60,86" stroke="#c79c4c" stroke-width="1.4"/>
      <ellipse cx="-12" cy="-6" rx="30" ry="40" fill="#fff" opacity="0.08"/>
    </g>
    <path d="M-34,2 q6,-7 12,0 q-6,-3 -12,0Z" fill="#2b1a0e"/>
    <path d="M22,2 q6,-7 12,0 q-6,-3 -12,0Z" fill="#2b1a0e"/>
    <rect x="-24" y="97" width="48" height="7" rx="2" fill="#2b1a0e"/>
    ${[-9, -3, 3, 9].map((x) => `<line x1="${x * 0.5}" y1="-96" x2="${x * 1.9}" y2="99" stroke="#f4e6c0" stroke-width="0.9"/>`).join("")}
  </g>
  <!-- 撥 -->
  <g transform="translate(300,178) rotate(28)">
    <path d="M0,0 L-24,-52 Q0,-62 24,-52Z" fill="url(#gBachi)" stroke="#8d7240" stroke-width="1.2"/>
    <rect x="-4" y="-2" width="8" height="18" rx="3" fill="#e2d2a6" stroke="#8d7240" stroke-width="1"/>
  </g>

  <!-- 舞う花びら -->
  ${petals.map(([x, y, r]) => `<path d="M0,0 C-4,-3 -5,-9 -3,-12 L0,-10 L3,-12 C5,-9 4,-3 0,0Z" transform="translate(${x},${y}) rotate(${r})" fill="#f8cfd8" stroke="#e39aab" stroke-width="0.6"/>`).join("")}
</svg>`;
}

/* ---- 表紙（画像のない本のために自動でつくる） ---- */

// 襲の色目（表・裏・題簽の色）
const KASANE = [
  { name: "桜", a: "#f7e3e6", b: "#e9aab8", ink: "#6e2a3a" },
  { name: "藤", a: "#e2d8ec", b: "#a58fbf", ink: "#3e2f56" },
  { name: "山吹", a: "#f7df9c", b: "#d99a3a", ink: "#5a3b12" },
  { name: "若草", a: "#dde9c7", b: "#89a86a", ink: "#304423" },
  { name: "紅梅", a: "#f2c6c2", b: "#c2554f", ink: "#5c1f1b" },
  { name: "青藍", a: "#cfdbe6", b: "#4f6f95", ink: "#1f2f45" },
  { name: "金地", a: "#f1dea0", b: "#c99a46", ink: "#4a3412" },
  { name: "墨", a: "#4a403a", b: "#221c19", ink: "#f3e8d6" },
];

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function coverHTML(book) {
  if (book.cover) {
    return `<div class="cover has-img"><img src="${book.cover}" alt="" loading="lazy" /></div>`;
  }
  const h = hashStr((book.title || "") + (book.author || ""));
  const k = KASANE[h % KASANE.length];
  const motif = (h >> 4) % 3;
  let ornament = "";
  if (motif === 0) {
    // 桜散らし
    const pts = [[30, 40, 0.7], [150, 70, 0.55], [60, 200, 0.6], [160, 230, 0.8], [110, 140, 0.4], [20, 130, 0.45]];
    ornament = pts.map(([x, y, s], i) => `<g transform="translate(${x},${y}) rotate(${(h >> i) % 72}) scale(${s})" opacity="0.55">${[0, 72, 144, 216, 288].map((r) => `<path d="${PETAL}" transform="rotate(${r})" fill="${k.b}"/>`).join("")}</g>`).join("");
  } else if (motif === 1) {
    // 青海波
    let w = "";
    for (let y = 180; y <= 300; y += 18) for (let x = (y / 18) % 2 ? 0 : 18; x <= 220; x += 36) {
      w += [16, 11, 6].map((r) => `<path d="M${x - r},${y} A${r},${r} 0 0 1 ${x + r},${y}" fill="none" stroke="${k.b}" stroke-width="1.6"/>`).join("");
    }
    ornament = `<g opacity="0.55">${w}</g>`;
  } else {
    // 琵琶のかげ
    ornament = `<g transform="translate(130,190) rotate(-24) scale(0.9)" opacity="0.28" fill="${k.b}">
      <path d="M0,-40 C30,-38 52,0 52,50 C52,100 28,125 0,125 C-28,125 -52,100 -52,50 C-52,0 -30,-38 0,-40Z"/>
      <path d="M-7,-38 L-5,-96 L5,-96 L7,-38Z"/><path d="M-5,-96 L5,-96 L15,-132 L5,-135Z"/></g>`;
  }
  const title = esc(book.title || "無題");
  const author = esc(book.author || "");
  const long = (book.title || "").length > 14 ? " long" : "";
  return `<div class="cover gen" style="--cv-a:${k.a};--cv-b:${k.b};--cv-ink:${k.ink}">
    <svg viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${ornament}</svg>
    <div class="cv-label${long}"><span>${title}</span></div>
    ${author ? `<div class="cv-author">${author}</div>` : ""}
  </div>`;
}

/** 読了や目標達成のときに花びらを散らす */
export function petalBurst(container, n = 28) {
  const host = container || document.body;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    p.className = "burst-petal";
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 1.2}s`;
    p.style.animationDuration = `${2.6 + Math.random() * 2.2}s`;
    p.style.setProperty("--dx", `${(Math.random() - 0.5) * 220}px`);
    p.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    host.appendChild(p);
    setTimeout(() => p.remove(), 6000);
  }
}
