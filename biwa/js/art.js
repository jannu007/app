// オリジナルの絵：黒漆に金の蒔絵（桜・琵琶・十二単の袖）。すべてSVGとCSSで描く。

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PETAL = "M0,0 C-7,-5 -10,-15 -6,-22 L0,-18.5 L6,-22 C10,-15 7,-5 0,0Z";

function flowerDefs(id, fill, edge) {
  return `<g id="${id}">
    ${[0, 72, 144, 216, 288].map((r) => `<path d="${PETAL}" transform="rotate(${r})" fill="${fill}" stroke="${edge}" stroke-width="0.8"/>`).join("")}
    <circle r="3.4" fill="#1a130b"/>
    ${[0, 72, 144, 216, 288].map((r) => `<line x1="0" y1="0" x2="0" y2="-7" transform="rotate(${r + 36})" stroke="#5a4218" stroke-width="0.9"/><circle cx="0" cy="-7.6" r="1.1" transform="rotate(${r + 36})" fill="#f6e3a6"/>`).join("")}
  </g>`;
}

/** 本棚の上に飾る絵：黒漆に金の蒔絵。桜、琵琶と撥、十二単の袖、霞と切金 */
export function heroSVG() {
  const blossoms = [
    [262, 26, 0.95, 10], [300, 48, 0.8, 40], [236, 58, 0.7, -20], [330, 20, 0.75, 15], [208, 30, 0.6, 33],
    [342, 78, 0.65, -12], [276, 86, 0.55, 22], [184, 64, 0.5, 5], [318, 112, 0.5, 48],
  ];
  const buds = [[222, 18], [290, 14], [352, 52], [250, 96], [196, 48]];
  const petals = [[120, 70, 30], [96, 140, -40], [160, 210, 70], [60, 220, 12], [318, 200, -24], [140, 32, 60], [196, 150, 18]];
  // 切金（きりかね）：細かな金箔の四角を散らす（決まった並びにして毎回同じ絵にする）
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  let kirikane = "";
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 360, y = rnd() * 260, s = 0.8 + rnd() * 2.6, r = rnd() * 90;
    kirikane += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" transform="rotate(${r.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" opacity="${(0.25 + rnd() * 0.55).toFixed(2)}"/>`;
  }
  let dust = "";
  for (let i = 0; i < 110; i++) dust += `<circle cx="${(rnd() * 360).toFixed(1)}" cy="${(rnd() * 260).toFixed(1)}" r="${(0.25 + rnd() * 0.7).toFixed(2)}" opacity="${(0.2 + rnd() * 0.5).toFixed(2)}"/>`;
  // 青海波（衣の文様）
  let waves = "";
  for (let y = 222; y <= 270; y += 9) for (let x = (y / 9) % 2 ? 0 : 9; x <= 220; x += 18) {
    waves += [8, 5.5, 3].map((r) => `<path d="M${x - r},${y} A${r},${r} 0 0 1 ${x + r},${y}"/>`).join("");
  }
  return `
<svg viewBox="0 0 360 260" preserveAspectRatio="xMaxYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="黒漆に金の蒔絵で描いた桜と琵琶">
  <defs>
    <radialGradient id="gLacquer" cx="62%" cy="40%" r="80%">
      <stop offset="0" stop-color="#211a12"/>
      <stop offset="0.55" stop-color="#110d09"/>
      <stop offset="1" stop-color="#050403"/>
    </radialGradient>
    <linearGradient id="gKin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6e3a6"/>
      <stop offset="0.35" stop-color="#d7b468"/>
      <stop offset="0.65" stop-color="#9c7630"/>
      <stop offset="1" stop-color="#e9cf86"/>
    </linearGradient>
    <linearGradient id="gKinSoft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c9a55a" stop-opacity="0"/>
      <stop offset="0.25" stop-color="#c9a55a" stop-opacity="0.32"/>
      <stop offset="0.75" stop-color="#e2c57c" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#c9a55a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3dc9a"/>
      <stop offset="0.45" stop-color="#c9a55a"/>
      <stop offset="0.8" stop-color="#8a6a2c"/>
      <stop offset="1" stop-color="#b8924a"/>
    </linearGradient>
    <clipPath id="cBody"><path d="M0,-40 C30,-38 52,0 52,50 C52,100 28,125 0,125 C-28,125 -52,100 -52,50 C-52,0 -30,-38 0,-40Z"/></clipPath>
    ${flowerDefs("fl", "url(#gKin)", "#6b5020")}
  </defs>

  <rect width="360" height="260" fill="url(#gLacquer)"/>
  <!-- 霞（すやり霞） -->
  <g fill="url(#gKinSoft)">
    <rect x="150" y="150" width="240" height="16" rx="8"/>
    <rect x="120" y="186" width="260" height="14" rx="7"/>
    <rect x="170" y="126" width="120" height="10" rx="5"/>
  </g>
  <g fill="#d9bb72">${kirikane}</g>
  <g fill="#e8cf8a">${dust}</g>

  <!-- 桜の枝（金の高蒔絵） -->
  <g fill="none" stroke-linecap="round" stroke="url(#gKin)">
    <path d="M372,6 C340,18 312,26 288,40 C262,55 238,52 214,44" stroke-width="6"/>
    <path d="M288,40 C296,62 312,80 330,104" stroke-width="4"/>
    <path d="M250,48 C240,30 226,22 206,24" stroke-width="3"/>
    <path d="M214,44 C200,52 190,60 178,64" stroke-width="2.6"/>
    <path d="M330,104 C340,110 346,120 350,132" stroke-width="2"/>
    <path d="M300,30 C304,18 300,10 292,4" stroke-width="2"/>
  </g>
  ${buds.map(([x, y]) => `<g transform="translate(${x},${y})"><ellipse rx="3.2" ry="4.8" fill="url(#gKin)" stroke="#6b5020" stroke-width="0.5"/></g>`).join("")}
  ${blossoms.map(([x, y, s, r]) => `<use href="#fl" transform="translate(${x},${y}) rotate(${r}) scale(${s})"/>`).join("")}

  <!-- 十二単の袖：黒の重ねに金の縁と青海波 -->
  <g stroke="url(#gKin)" stroke-width="1.1">
    <path d="M-10,262 C10,214 44,196 84,200 C112,203 120,226 150,232 C176,237 196,226 210,262Z" fill="#1d1711"/>
    <path d="M-10,262 C8,226 38,212 72,214 C100,216 112,238 140,244 C160,248 180,244 192,262Z" fill="#2a1712"/>
    <path d="M-10,262 C6,238 30,228 58,229 C86,230 100,248 124,252 C140,255 156,254 168,262Z" fill="#14110d"/>
    <path d="M-10,262 C4,248 22,242 44,243 C66,244 80,256 96,262Z" fill="#0a0806"/>
  </g>
  <g fill="none" stroke="#c9a55a" stroke-width="0.6" opacity="0.45" clip-path="url(#cSleeve)">${waves}</g>
  <clipPath id="cSleeve"><path d="M-10,262 C10,214 44,196 84,200 C112,203 120,226 150,232 C176,237 196,226 210,262Z"/></clipPath>

  <!-- 琵琶 -->
  <g transform="translate(252,150) rotate(-30) scale(0.82)">
    <path d="M-7,-38 L-5,-96 L5,-96 L7,-38Z" fill="#7a5c26"/>
    <path d="M-5,-96 L5,-96 L15,-132 L5,-135Z" fill="#5e461c"/>
    ${[-104, -112, -120, -128].map((y, i) => `<line x1="${i % 2 ? 2 : -14}" y1="${y}" x2="${i % 2 ? 20 : 4}" y2="${y + 2}" stroke="#e2c57c" stroke-width="2.6" stroke-linecap="round" transform="rotate(${i * 2} 5 ${y})"/>`).join("")}
    <path d="M0,-40 C30,-38 52,0 52,50 C52,100 28,125 0,125 C-28,125 -52,100 -52,50 C-52,0 -30,-38 0,-40Z" fill="url(#gBody)" stroke="#f3dfa3" stroke-width="1.4"/>
    <g clip-path="url(#cBody)">
      <path d="M-60,30 L60,52 L60,86 L-60,64Z" fill="#0c0a08"/>
      <use href="#fl" transform="translate(-16,52) scale(0.42)"/>
      <use href="#fl" transform="translate(18,62) scale(0.32) rotate(20)"/>
      <path d="M-60,30 L60,52" stroke="#f0d995" stroke-width="1.2"/>
      <path d="M-60,64 L60,86" stroke="#f0d995" stroke-width="1.2"/>
      <ellipse cx="-14" cy="-6" rx="28" ry="42" fill="#fff8dc" opacity="0.16"/>
    </g>
    <rect x="-24" y="97" width="48" height="7" rx="2" fill="#0c0a08" stroke="#c9a55a" stroke-width="0.8"/>
    ${[-9, -3, 3, 9].map((x) => `<line x1="${x * 0.5}" y1="-96" x2="${x * 1.9}" y2="99" stroke="#2a2014" stroke-width="0.9"/>`).join("")}
  </g>
  <!-- 撥 -->
  <g transform="translate(300,178) rotate(28)">
    <path d="M0,0 L-24,-52 Q0,-62 24,-52Z" fill="#0e0b08" stroke="url(#gKin)" stroke-width="1.4"/>
    <path d="M-14,-44 Q0,-50 14,-44" fill="none" stroke="#c9a55a" stroke-width="0.6" opacity="0.7"/>
    <rect x="-4" y="-2" width="8" height="18" rx="3" fill="url(#gKin)"/>
  </g>

  <!-- 舞う花びら（金） -->
  ${petals.map(([x, y, r]) => `<path d="M0,0 C-4,-3 -5,-9 -3,-12 L0,-10 L3,-12 C5,-9 4,-3 0,0Z" transform="translate(${x},${y}) rotate(${r})" fill="url(#gKin)" opacity="0.85"/>`).join("")}
  <rect x="0.5" y="0.5" width="359" height="259" fill="none" stroke="#c9a55a" stroke-opacity="0.35"/>
</svg>`;
}

/* ---- 表紙（画像のない本のために自動でつくる） ---- */

// 襲の色目（表・裏・題簽の色）
const KASANE = [
  { name: "黒漆", a: "#15110d", b: "#c9a55a", ink: "#e9d6a4" },
  { name: "深緋", a: "#3a1512", b: "#d0a85c", ink: "#f0dca8" },
  { name: "濃紫", a: "#24182e", b: "#c9a55a", ink: "#e6d3a6" },
  { name: "鉄紺", a: "#131b2a", b: "#c7a75f", ink: "#e4d4aa" },
  { name: "千歳緑", a: "#142319", b: "#c9a55a", ink: "#e3d6a8" },
  { name: "黒橡", a: "#201a14", b: "#d6b26a", ink: "#eddcaa" },
  { name: "金地", a: "#b8924a", b: "#2a1f12", ink: "#1a130b" },
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
