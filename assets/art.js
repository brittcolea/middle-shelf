/* Middle Shelf: ink + stipple illustrations, drawn as SVG.
   Everything is built from a few primitives so new scenes are easy to add. */
(function () {
  const INK = "#1b1815", PAPER = "#f6f2ea", GOLD = "#c69a55";
  let uid = 0;

  // Shared <defs>: two stipple densities and a left-to-right fade mask, so
  // dots gather on the shadow side of whatever shape they fill.
  function defs(id) {
    const sparse = [[1, 2, .75], [6.2, 1, .6], [3.4, 6, .7], [8.3, 7.4, .6], [5.1, 9.3, .55]];
    const dense = sparse.concat([[2.2, 4.1, .6], [7.4, 4.4, .65], [9.4, 1.8, .5], [.6, 8.2, .6], [4.3, 2.9, .5], [6.4, 6.6, .6], [9.6, 9.4, .5]]);
    const dots = (a) => a.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");
    return `<defs>
      <pattern id="${id}s" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(17)"><g fill="${INK}">${dots(sparse)}</g></pattern>
      <pattern id="${id}d" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(17)"><g fill="${INK}">${dots(dense)}</g></pattern>
      <linearGradient id="${id}g"><stop offset=".25" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
      <linearGradient id="${id}gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
      <mask id="${id}m" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${id}g)"/></mask>
      <mask id="${id}mv" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${id}gv)"/></mask>
    </defs>`;
  }
  const S = (w = 3) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const shade = (id, d, dense, vertical) =>
    `<path d="${d}" fill="url(#${id}${dense ? "d" : "s"})" mask="url(#${id}${vertical ? "mv" : "m"})"/>`;
  const shadow = (id, cx, cy, rx, ry) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}d)" opacity=".8"/>`;

  // ---------- Glasses (local frame 200 x 240, base near y=215) ----------
  const GLASS = {
    coupe: { rim: [100, 70, 60, 9], bowl: "M40 70 Q40 136 100 141 Q160 136 160 70", liq: "M47 84 Q49 130 100 134 Q151 130 153 84 Z", liqTop: [100, 84, 53, 7], stem: "M100 141 L100 204", base: [100, 210, 36, 7] },
    nick: { rim: [100, 52, 43, 7], bowl: "M57 52 Q54 136 100 143 Q146 136 143 52", liq: "M59 76 Q58 134 100 138 Q142 134 141 76 Z", liqTop: [100, 76, 41, 6], stem: "M100 143 L100 204", base: [100, 210, 32, 6] },
    martini: { rim: [100, 56, 72, 9], bowl: "M28 56 L100 138 L172 56", liq: "M42 70 L100 132 L158 70 Z", liqTop: [100, 70, 58, 7], stem: "M100 138 L100 204", base: [100, 210, 36, 7] },
    rocks: { rim: [100, 108, 52, 8], bowl: "M48 108 L56 212 Q100 222 144 212 L152 108", liq: "M51 136 L55.6 200 Q100 209 144.4 200 L149 136 Z", liqTop: [100, 136, 49, 7], inner: "M56 200 Q100 209 144 200" },
    highball: { rim: [100, 36, 37, 6], bowl: "M63 36 L68 216 Q100 223 132 216 L137 36", liq: "M64.2 62 L68 206 Q100 213 132 206 L135.8 62 Z", liqTop: [100, 62, 36, 5], inner: "M68 206 Q100 213 132 206" },
    wine: { rim: [100, 40, 40, 7], bowl: "M60 40 Q50 122 100 130 Q150 122 140 40", liq: "M56 84 Q56 124 100 126 Q144 124 144 84 Z", liqTop: [100, 84, 44, 6], stem: "M100 130 L100 204", base: [100, 210, 34, 6] },
    flute: { rim: [100, 22, 18, 4], bowl: "M82 22 Q78 116 100 132 Q122 116 118 22", liq: "M82.6 44 Q80 114 100 128 Q120 114 117.4 44 Z", liqTop: [100, 44, 17.5, 3.5], stem: "M100 132 L100 204", base: [100, 210, 28, 5] },
    snifter: { rim: [100, 74, 30, 6], bowl: "M70 74 Q40 120 62 150 Q100 176 138 150 Q160 120 130 74", liq: "M50 128 Q52 152 68 158 Q100 174 132 158 Q148 152 150 128 Z", liqTop: [100, 128, 50, 8], stem: "M100 168 L100 204", base: [100, 210, 32, 6] },
    mug: { rim: [96, 60, 44, 7], bowl: "M52 60 L56 212 Q96 222 136 212 L140 60", liq: "M53.4 84 L56.6 202 Q96 211 135.4 202 L138.6 84 Z", liqTop: [96, 84, 42.6, 6], handle: "M139 92 Q176 92 174 132 Q172 170 137 168" },
  };
  function glassKey(g) {
    g = String(g || "").toLowerCase();
    if (/nick|nora/.test(g)) return "nick";
    if (/coupe|cocktail glass/.test(g)) return "coupe";
    if (/martini/.test(g)) return "martini";
    if (/high|collins|tall/.test(g)) return "highball";
    if (/flute|champ/.test(g)) return "flute";
    if (/snifter/.test(g)) return "snifter";
    if (/wine|goblet|punch/.test(g)) return "wine";
    if (/mug|tiki|julep|copper/.test(g)) return "mug";
    return "rocks";
  }
  const ell = ([cx, cy, rx, ry], extra = "") => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${extra}/>`;

  function glass(id, kind, color, garnish) {
    const g = GLASS[kind] || GLASS.rocks;
    const col = color || GOLD;
    const baseY = g.base ? g.base[1] : 214;
    let o = shadow(id, 100 + 14, baseY + 8, g.base ? g.base[2] + 16 : 62, 7);
    // liquid
    o += `<path d="${g.liq}" fill="${col}" opacity=".88"/>` + shade(id, g.liq, true);
    o += ell(g.liqTop, `fill="${col}" ${S(1.6)} opacity=".95"`) + ell(g.liqTop, `fill="#fff" opacity=".18"`);
    // glass body shading + outline
    o += shade(id, g.bowl + " Z", false);
    if (g.stem) o += `<path d="${g.stem}" fill="none" ${S(3)}/>`;
    if (g.base) o += ell(g.base, `fill="${PAPER}" ${S(2.6)}`) + shade(id, `M${g.base[0] - g.base[2]} ${g.base[1]} a${g.base[2]} ${g.base[3]} 0 1 0 ${g.base[2] * 2} 0 a${g.base[2]} ${g.base[3]} 0 1 0 ${-g.base[2] * 2} 0`, true);
    if (g.handle) o += `<path d="${g.handle}" fill="none" ${S(3.4)}/>`;
    o += `<path d="${g.bowl}" fill="none" ${S(3.2)}/>`;
    if (g.inner) o += `<path d="${g.inner}" fill="none" ${S(1.6)}/>`;
    o += ell(g.rim, `fill="none" ${S(2.6)}`);
    // highlight
    const [rx, ry, rw] = g.rim;
    o += `<path d="M${rx - rw * .7} ${ry + 16} q-3 24 2 46" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".75"/>`;
    o += garnishFor(id, kind, garnish, g);
    return o;
  }

  // ---------- Garnishes ----------
  function citrusWheel(id, cx, cy, r, fill) {
    let segs = "";
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      segs += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r * .78).toFixed(1)}" y2="${(cy + Math.sin(a) * r * .78).toFixed(1)}" ${S(1.2)}/>`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${S(2.4)}/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r * .8}" fill="none" ${S(1.2)}/>` + segs +
      shade(id, `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`, false);
  }
  const cherry = (id, cx, cy, r = 9) =>
    `<path d="M${cx} ${cy - r} q4 -18 18 -24" fill="none" ${S(2)}/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#5e1620" ${S(2)}/>` +
    `<circle cx="${cx - r * .35}" cy="${cy - r * .35}" r="${r * .25}" fill="#fff" opacity=".7"/>`;
  const twist = (x, y, s = 1) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 C16 -12 34 0 22 12 C10 24 -10 16 -2 4 C4 -4 18 -2 18 8" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M0 0 C16 -12 34 0 22 12 C10 24 -10 16 -2 4 C4 -4 18 -2 18 8" fill="none" ${S(1.6)}/></g>`;
  const cube = (id, x, y, s, rot = 0) =>
    `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * .14}" fill="#fff" fill-opacity=".45" ${S(2)}/>` +
    `<path d="M${-s * .3} ${-s * .32} l${s * .4} 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>` +
    shade(id, `M${-s / 2} ${-s / 2} h${s} v${s} h${-s} Z`, false) + `</g>`;
  const leaf = (x, y, rot, s = 1) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 Q12 -14 30 0 Q12 14 0 0 Z" fill="#7d9a5a" ${S(1.8)}/><path d="M2 0 L26 0" ${S(1.1)}/></g>`;
  const bubbles = (pts) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" ${S(1.2)}/>`).join("");

  function garnishFor(id, kind, garnish, g) {
    garnish = String(garnish || "").toLowerCase();
    const [rx, ry, rw] = g.rim;
    let o = "";
    if (/salt|sugar|rim/.test(garnish)) o += `<path d="M${rx - rw} ${ry} a${rw} ${g.rim[3]} 0 0 0 ${rw * 2} 0" fill="none" stroke="${INK}" stroke-width="5" stroke-dasharray="0.1 4.5" stroke-linecap="round"/>`;
    if (kind === "rocks" || kind === "highball" || kind === "mug") {
      if (kind === "rocks") o += cube(id, 100, 150, 46, -8);
      else o += cube(id, 92, 96, 30, 10) + cube(id, 106, 140, 30, -14) + bubbles([[86, 180, 3], [116, 168, 2.4], [98, 196, 2], [120, 118, 2.2]]);
    }
    if (/cherry|cherries/.test(garnish)) o += cherry(id, rx + rw * .45, ry + 4);
    else if (/lime|lemon wheel|wheel/.test(garnish)) o += citrusWheel(id, rx + rw * .82, ry - 6, 20, /lemon/.test(garnish) ? "#f2df8c" : "#cfdc86");
    else if (/twist|peel|spiral/.test(garnish)) o += twist(rx + rw * .5, ry - 14, .9);
    else if (/mint/.test(garnish)) o += leaf(rx + 4, ry - 10, -60) + leaf(rx + 8, ry - 12, -20) + leaf(rx - 4, ry - 8, -110, .9);
    else if (/wedge|slice/.test(garnish)) o += `<path d="M${rx + rw * .55} ${ry - 2} a20 20 0 0 1 36 6 Z" fill="#cfdc86" ${S(2.2)}/>`;
    else if (/nutmeg|cinnamon/.test(garnish)) o += ell([rx, g.liqTop ? g.liqTop[1] : ry + 10, rw * .5, 3], `fill="url(#${id}d)"`);
    return o;
  }

  // ---------- Bottles (local frame 120 x 260, base at y=250) ----------
  const BOTTLE = {
    whiskey: { body: "M28 250 L28 112 Q28 90 50 85 L50 42 L70 42 L70 85 Q92 90 92 112 L92 250 Z", cap: [47, 26, 26, 18], label: [34, 140, 52, 64] },
    gin: { body: "M26 250 L26 100 Q26 80 48 76 L52 40 L68 40 L72 76 Q94 80 94 100 L94 250 Z", cap: [49, 24, 22, 18], label: [32, 128, 56, 70] },
    rum: { body: "M20 250 L20 152 Q20 116 50 110 L52 62 L68 62 L70 110 Q100 116 100 152 L100 250 Z", cap: [49, 46, 22, 18], label: [26, 168, 68, 50] },
    tequila: { body: "M36 250 L26 124 Q28 100 52 96 L52 48 L68 48 L68 96 Q92 100 94 124 L84 250 Z", cap: [48, 30, 24, 20], label: [34, 150, 52, 54] },
    cognac: { body: "M22 250 Q14 196 28 150 Q38 118 52 108 L52 60 L68 60 L68 108 Q82 118 92 150 Q106 196 98 250 Z", cap: [46, 40, 28, 22], label: [34, 164, 52, 46] },
    vodka: { body: "M38 250 L38 82 Q38 64 52 60 L54 26 L66 26 L68 60 Q82 64 82 82 L82 250 Z", cap: [52, 12, 16, 16], label: [42, 140, 36, 70] },
    liqueur: { body: "M60 250 Q10 250 12 190 Q14 140 52 128 L52 70 L68 70 L68 128 Q106 140 108 190 Q110 250 60 250 Z", cap: [48, 54, 24, 18], label: [30, 176, 60, 40] },
    bitters: { body: "M40 250 L40 172 Q40 156 52 152 L54 132 L66 132 L68 152 Q80 156 80 172 L80 250 Z", cap: [52, 114, 16, 20], label: [34, 176, 52, 62], big: true },
    wine: { body: "M36 250 L36 124 Q36 98 54 92 L54 40 L66 40 L66 92 Q84 98 84 124 L84 250 Z", cap: [52, 26, 16, 18], label: [40, 154, 40, 56] },
  };
  function bottle(id, kind, tint) {
    const b = BOTTLE[kind] || BOTTLE.whiskey;
    const [lx, ly, lw, lh] = b.label;
    const [cx, cy, cw, ch] = b.cap;
    return shadow(id, 70, 252, 46, 6) +
      `<path d="${b.body}" fill="${tint || "#d9c7a0"}" opacity=".55"/>` + shade(id, b.body, true) +
      `<path d="${b.body}" fill="none" ${S(3)}/>` +
      `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="3" fill="${INK}"/>` +
      `<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="2" fill="${PAPER}" ${S(2)}/>` +
      `<rect x="${lx}" y="${ly + 6}" width="${lw}" height="5" fill="${GOLD}"/>` +
      `<line x1="${lx + 8}" y1="${ly + lh * .5}" x2="${lx + lw - 8}" y2="${ly + lh * .5}" ${S(2.2)}/>` +
      `<line x1="${lx + 14}" y1="${ly + lh * .72}" x2="${lx + lw - 14}" y2="${ly + lh * .72}" ${S(1.4)}/>` +
      `<path d="M${lx - 4} ${ly - 30} q-3 20 0 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
  }

  // ---------- Small props ----------
  const lime = (id, x, y) =>
    `<g transform="translate(${x} ${y})">${shadow(id, 4, 26, 30, 5)}<path d="M-26 20 a26 26 0 0 1 52 0 Z" fill="#cfdc86" ${S(2.4)}/>` +
    `<path d="M-20 20 a20 20 0 0 1 40 0" fill="none" ${S(1.2)}/>` +
    [-60, -30, 0, 30, 60].map((a) => `<line x1="0" y1="20" x2="${(Math.sin(a * Math.PI / 180) * 18).toFixed(1)}" y2="${(20 - Math.cos(a * Math.PI / 180) * 18).toFixed(1)}" ${S(1.1)}/>`).join("") + `</g>`;
  const egg = (id, x, y) =>
    `<g transform="translate(${x} ${y})">${shadow(id, 6, 26, 22, 4)}<ellipse cx="0" cy="0" rx="17" ry="23" fill="${PAPER}" ${S(2.4)}/>${shade(id, "M-17 0 a17 23 0 1 0 34 0 a17 23 0 1 0 -34 0", true)}</g>`;
  const agave = (id, x, y, s = 1) => {
    const leaves = [[-70, 1], [-45, 1.1], [-20, 1.2], [0, 1.25], [20, 1.2], [45, 1.1], [70, 1]];
    return `<g transform="translate(${x} ${y}) scale(${s})">${shadow(id, 0, 4, 60, 6)}` + leaves.map(([a, l]) =>
      `<g transform="rotate(${a})"><path d="M-9 0 Q-6 ${-60 * l} 0 ${-92 * l} Q6 ${-60 * l} 9 0 Z" fill="#9db08a" ${S(2.2)}/>${shade(id, `M-9 0 Q-6 ${-60 * l} 0 ${-92 * l} Q6 ${-60 * l} 9 0 Z`, false)}</g>`).join("") + `</g>`;
  };
  const juniper = (x, y) =>
    `<g transform="translate(${x} ${y})"><path d="M0 0 Q20 -30 50 -44" fill="none" ${S(2)}/>` +
    [[10, -12], [22, -24], [34, -34], [46, -42]].map(([a, b]) => `<path d="M${a} ${b} l-10 -10 M${a} ${b} l10 2" ${S(1.6)}/>`).join("") +
    [[18, -6], [30, -16], [8, -22]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="5.5" fill="#4e5f7d" ${S(1.6)}/>`).join("") + `</g>`;
  const pineapple = (id, x, y) =>
    `<g transform="translate(${x} ${y})">${shadow(id, 0, 60, 34, 5)}` +
    [-28, -12, 0, 12, 28].map((a) => `<path d="M0 -38 Q${a * .6} -64 ${a} -84" fill="none" stroke="#6f8a52" stroke-width="7" stroke-linecap="round"/><path d="M0 -38 Q${a * .6} -64 ${a} -84" fill="none" ${S(1.4)}/>`).join("") +
    `<ellipse cx="0" cy="12" rx="30" ry="48" fill="#d9b25e" ${S(2.6)}/>` +
    `<path d="M-26 -14 L22 46 M-30 12 L6 58 M-18 -34 L28 24 M26 -14 L-22 46 M30 12 L-6 58 M18 -34 L-28 24" ${S(1.2)} fill="none"/>` +
    shade(id, "M-30 12 a30 48 0 1 0 60 0 a30 48 0 1 0 -60 0", true) + `</g>`;

  // ---------- Scenes (viewBox 360 x 260) ----------
  const place = (inner, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`;
  const SCENES = {
    house: (id) => place(bottle(id, "whiskey", "#c47a2c"), 34, 20, .88) + place(glass(id, "rocks", "#7a2a24", "cherry"), 108, 70, .8) + place(glass(id, "coupe", "#8e1f2f", "cherry"), 196, 30, .9),
    "old-fashioned": (id) => place(bottle(id, "bitters", "#7a4a2a"), 52, 76, .7) + place(glass(id, "rocks", "#c47a2c", "orange twist"), 126, 40, 1.0),
    martini: (id) => place(glass(id, "martini", "#e3e7d8", "lemon twist"), 90, 20, 1.0) + place(bottle(id, "wine", "#b9c49a"), 236, 52, .75),
    daiquiri: (id) => place(glass(id, "coupe", "#e9e3b4", "lime wheel"), 80, 24, 1.0) + lime(id, 270, 200),
    sidecar: (id) => place(glass(id, "coupe", "#d08a3a", "sugar rim twist"), 64, 24, 1.0) + place(bottle(id, "liqueur", "#e8823a"), 226, 60, .72),
    highball: (id) => place(glass(id, "highball", "#e3c27a", "lemon wheel"), 72, 14, 1.0) + place(glass(id, "highball", "#dfe8e2", "lime wheel"), 160, 34, .9),
    flip: (id) => place(glass(id, "wine", "#ecdcc2", "nutmeg"), 90, 24, 1.0) + egg(id, 270, 214),
    whiskey: (id) => place(bottle(id, "whiskey", "#c47a2c"), 70, 10, .95) + place(glass(id, "rocks", "#c47a2c"), 170, 80, .8),
    gin: (id) => place(bottle(id, "gin", "#dfe8e2"), 80, 8, .96) + juniper(200, 220) + place(glass(id, "nick", "#e6ecef", "lemon twist"), 214, 90, .72),
    rum: (id) => place(bottle(id, "rum", "#c9772e"), 70, 12, .95) + pineapple(id, 250, 168),
    agave: (id) => agave(id, 120, 236, 1) + place(bottle(id, "tequila", "#e6d79a"), 210, 30, .86),
    brandy: (id) => place(bottle(id, "cognac", "#b3622a"), 60, 14, .95) + place(glass(id, "snifter", "#b3622a"), 170, 50, .9),
    vodka: (id) => place(bottle(id, "vodka", "#e6ecef"), 90, 6, .98) + place(glass(id, "nick", "#eef1f2", "twist"), 200, 90, .72),
    liqueur: (id) => place(bottle(id, "liqueur", "#e8823a"), 60, 24, .9) + place(bottle(id, "wine", "#8e1f2f"), 190, 18, .9),
    "amaro & aperitivo": (id) => place(bottle(id, "wine", "#b8323a"), 70, 16, .92) + place(glass(id, "rocks", "#e8823a", "orange twist"), 170, 80, .8),
    "vermouth & fortified": (id) => place(bottle(id, "wine", "#9e2235"), 80, 16, .92) + place(glass(id, "nick", "#e3d9a0", "twist"), 190, 90, .72),
    bitters: (id) => place(bottle(id, "bitters", "#7a4a2a"), 60, -56, 1.2) + place(bottle(id, "bitters", "#c27a3a"), 170, -20, 1.05),
    other: (id) => place(bottle(id, "gin", "#c9d7c0"), 120, 10, .95),
  };
  const SPIRIT_SCENE = { scotch: "whiskey", bourbon: "whiskey", rye: "whiskey", tequila: "agave", mezcal: "agave", cognac: "brandy" };

  function scene(name, label) {
    const key = String(name || "").toLowerCase();
    const fn = SCENES[key] || SCENES[SPIRIT_SCENE[key]] || SCENES.other;
    const id = "a" + ++uid;
    return `<svg class="scene" viewBox="0 14 360 250" role="img" aria-label="${label || name}">${defs(id)}${fn(id)}</svg>`;
  }

  function drinkArt(d, color) {
    const id = "a" + ++uid;
    return `<svg class="glass-art" viewBox="0 0 200 240" role="img" aria-label="${d.glass || "glass"}">${defs(id)}${glass(id, glassKey(d.glass), color, d.garnish)}</svg>`;
  }

  // ---------- Logo: the words sit on the middle shelf of a bar ----------
  function logo() {
    // Big letters standing in front of a row of bottles on the shelf.
    const id = "a" + ++uid;
    const SHELF = 178;
    const plank = `<rect x="6" y="${SHELF}" width="368" height="11" rx="1.5" fill="#d8c29a" ${S(2.6)}/>` + shade(id, `M6 ${SHELF} h368 v11 h-368 Z`, true, true);
    const bracket = (x) => `<path d="M${x} ${SHELF + 11} l0 22 l16 0 Z" fill="${PAPER}" ${S(2.2)}/><circle cx="${x + 4.5}" cy="${SHELF + 19}" r="2" fill="${INK}"/>`;
    const row = [["wine", "#9e2235", .68], ["whiskey", "#c47a2c", .64], ["gin", "#dfe8e2", .7], ["rum", "#c9772e", .62],
      ["vodka", "#e6ecef", .74], ["tequila", "#e6d79a", .64], ["cognac", "#b3622a", .62], ["whiskey", "#7a3b1e", .68]];
    const step = 352 / row.length;
    const bottlesRow = row.map(([k, c, sc], i) => place(bottle(id, k, c), 6 + i * step + step / 2 - 60 * sc, SHELF - 250 * sc, sc)).join("");
    return `<svg class="logo" viewBox="0 0 380 216" role="img" aria-label="The Middle Shelf">${defs(id)}
      ${bottlesRow}
      <text x="190" y="${SHELF - 58}" text-anchor="middle" class="logo-word" font-size="22" letter-spacing="6"
        fill="${INK}" stroke="${PAPER}" stroke-width="6" stroke-linejoin="round" paint-order="stroke">THE</text>
      <text x="190" y="${SHELF - 6}" text-anchor="middle" class="logo-word" font-size="50" textLength="344" lengthAdjust="spacingAndGlyphs"
        fill="${INK}" stroke="${PAPER}" stroke-width="7" stroke-linejoin="round" paint-order="stroke" letter-spacing="1">MIDDLE SHELF</text>
      ${plank}${bracket(30)}${bracket(334)}
    </svg>`;
  }

  // Arched page title, like the "Pick Your Poison" header.
  function arch(text) {
    const t = String(text).toUpperCase();
    const size = Math.min(34, Math.round(560 / Math.max(t.length, 8)));
    const id = "a" + ++uid;
    return `<svg class="arch" viewBox="0 0 340 92" role="heading" aria-level="2" aria-label="${text}">
      <path id="${id}p" d="M24 88 Q170 -6 316 88" fill="none"/>
      <text class="arch-text" font-size="${size}" fill="${INK}"><textPath href="#${id}p" startOffset="50%" text-anchor="middle">${t.replace(/&/g, "&amp;")}</textPath></text></svg>`;
  }

  window.MSArt = { scene, drinkArt, logo, arch, glassKey };
})();
