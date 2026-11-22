/* Middle Shelf: shared data loading + helpers.
   Data lives in a Google Sheet (shared "anyone with the link can view").
   Each tab is fetched as CSV through the gviz endpoint, so edits in the
   sheet show up on the next page load. */
(function () {
  const cfg = window.MS_CONFIG || {};
  const CACHE_KEY = "ms-cache-v1";

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", i = 0, q = false;
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function keyOf(h) {
    return String(h || "")
      .replace(/\(.*?\)/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function toObjects(rows) {
    if (!rows.length) return [];
    const keys = rows[0].map(keyOf);
    return rows.slice(1)
      .map((r) => {
        const o = {};
        keys.forEach((k, idx) => { if (k) o[k] = (r[idx] || "").trim(); });
        return o;
      })
      .filter((o) => Object.values(o).some((v) => v !== ""));
  }

  // ---------- Fetch ----------
  async function fetchTab(name) {
    const url =
      "https://docs.google.com/spreadsheets/d/" + cfg.sheetId +
      "/gviz/tq?tqx=out:csv&headers=1&sheet=" + encodeURIComponent(name) +
      "&_=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(name + ": HTTP " + res.status);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error(name + ": sheet is not shared publicly");
    return toObjects(parseCSV(text));
  }

  async function load(tabs) {
    if (cfg.sheetId) {
      try {
        const lists = await Promise.all(tabs.map(fetchTab));
        const data = {};
        tabs.forEach((t, i) => (data[t] = lists[i]));
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (e) {}
        return { data, source: "live" };
      } catch (err) {
        console.warn("Live load failed, falling back", err);
      }
    }
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && tabs.every((t) => c.data[t])) return { data: c.data, source: "cache", at: c.at };
    } catch (e) {}
    const snap = window.MS_SNAPSHOT || {};
    const data = {};
    tabs.forEach((t) => (data[t] = snap[t] || []));
    return { data, source: "snapshot" };
  }

  // ---------- Helpers ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const yes = (v) => /^(y|yes|true|x|1|on|✓|✔)$/i.test(String(v || "").trim());
  const no = (v) => /^(n|no|false|0|off|hide|hidden)$/i.test(String(v || "").trim());

  const STATUS = {
    "in stock": "in", "low": "low", "out": "out", "wishlist": "wish", "tried": "tried",
  };
  const statusOf = (s) => STATUS[String(s || "").trim().toLowerCase()] || "unknown";
  const onShelf = (s) => ["in", "low"].includes(statusOf(s));

  // Turn a Google Drive share link into a direct image URL. Other URLs and
  // repo-relative paths (photos/foo.jpg) pass through unchanged.
  function photoUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    let m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/);
    if (m && /google\.com/.test(u)) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1200";
    return u;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  // "3/4 oz Bourbon" -> { amt: "¾ oz", item: "Bourbon" }
  const FRACS = { "1/2": "½", "1/4": "¼", "3/4": "¾", "1/3": "⅓", "2/3": "⅔", "1/8": "⅛" };
  const UNIT = "(?:oz|ounces?|dash(?:es)?|drops?|tsp|tbsp|barspoons?|bsp|cups?|ml|sprigs?|leaves|slices?|wheels?|wedges?|whole|pinch|parts?|rinse|top)";
  // "1 1/2" -> "1½", "3/4" -> "¾" (a fraction without a glyph stays as written)
  function PRETTY(a) {
    return String(a || "").trim()
      .replace(/^(\d+)\s+(\d\/\d)$/, (m, w, f) => (FRACS[f] ? w + FRACS[f] : m))
      .replace(/^(\d\/\d)$/, (f) => FRACS[f] || f);
  }
  const ING_RE =new RegExp("^((?:\\d+(?:\\.\\d+)?\\s*)?(?:\\d+/\\d+)?\\s*" + UNIT + "?\\.?)\\s+(.+)$", "i");
  function parseIngredient(line) {
    line = String(line).replace(/^[-•*]\s*/, "").trim();
    if (!line) return null;
    let amt = "", item = line;
    const pipe = line.split("|");
    if (pipe.length > 1) { amt = pipe[0].trim(); item = pipe.slice(1).join("|").trim(); }
    else {
      const m = line.match(ING_RE);
      if (m && /\d|dash|top|rinse|pinch/i.test(m[1])) { amt = m[1].trim(); item = m[2].trim(); }
    }
    amt = PRETTY(amt).replace(/^\.5\b/, "½").replace(/^\.75\b/, "¾").replace(/^\.25\b/, "¼");
    return { amt, item };
  }
  const ingredients = (text) =>
    String(text || "").split(/\n|;(?![^()]*\))/).map(parseIngredient).filter(Boolean);

  // ---------- Recipe Ingredients (one row per ingredient) ----------
  // Returns { drinkName: [{ amt, item, note, type, bottle, status, pour }] }
  function recipes(rows, lists) {
    const pantryTypes = new Set((lists || []).filter((l) => /pantry/i.test(l.kind || "")).map((l) => l.ingredient));
    const map = {};
    (rows || []).forEach((r) => {
      if (!r.drink || !(r.ingredient || r.bottle)) return;
      const type = r.ingredient || "", bottle = r.bottle_pick_one || r.bottle || "";
      let label = bottle || type;
      if (!bottle && pantryTypes.has(type) && !/^(Luxardo|Tabasco)/.test(type)) label = type.charAt(0).toLowerCase() + type.slice(1);
      const n = parseFloat(r.amount) || 0, unit = (r.unit || "").toLowerCase();
      const unitWord = unit === "dash" ? (n > 1 || /-/.test(r.amount) ? "dashes" : "dash")
        : unit === "cup" ? (n > 1 ? "cups" : "cup") : unit === "whole" ? "" : unit === "leaves" ? "" : unit;
      if (unit === "leaves") label += " leaves";
      let amt = [PRETTY(r.amount), unitWord].filter(Boolean).join(" ");
      if (unit === "top" && !r.amount) amt = "top";
      if (unit === "splash" && !r.amount) amt = "splash";
      // The sheet's Status column: "Have it", "Sub" (pour a same-style bottle instead) or "Buy".
      const status = r.status || "", pour = r.pour || "";
      const base = label;
      if (status === "Sub" && pour) label += " (subbed with " + pour + ")";
      (map[r.drink] = map[r.drink] || []).push({ amt, item: label, base, note: r.note || "", type, bottle, status, pour });
    });
    return map;
  }

  // ---------- Glass placeholder art ----------
  const NAMED = {
    amber: "#c47a2c", bourbon: "#c47a2c", whiskey: "#c47a2c", gold: "#d9a441", rum: "#d39a3f",
    clear: "#dfe8e2", gin: "#dfe8e2", vodka: "#e6ecef", silver: "#e3e7e9", pale: "#e8dca0",
    tequila: "#e6d79a", agave: "#e6d79a", mezcal: "#d8cf9a", brandy: "#b3622a", cognac: "#b3622a",
    cream: "#ecdcc2", creamy: "#ecdcc2", orange: "#e8823a", red: "#b8323a", ruby: "#9e2235",
    pink: "#e58a9a", cherry: "#8e1f2f", green: "#9cc27a", yellow: "#efd56a", brown: "#6b3f22",
    coffee: "#3b2418", lime: "#c9dc7a", lemon: "#f2e08a", copper: "#c4733a",
  };
  function drinkColor(d) {
    const c = String(d.color || "").trim().toLowerCase();
    if (/^#[0-9a-f]{3,8}$/.test(c)) return c;
    if (NAMED[c]) return NAMED[c];
    const b = String(d.base_spirit || "").toLowerCase();
    for (const k of Object.keys(NAMED)) if (b.includes(k)) return NAMED[k];
    return "#c9a25b";
  }

  const GLASSES = {
    coupe: {
      glass: "M20 34 Q20 64 50 66 Q80 64 80 34 Z M50 66 L50 100 M36 102 Q50 98 64 102",
      liquid: "M23 38 Q24 61 50 63 Q76 61 77 38 Z",
    },
    nick: {
      glass: "M28 26 Q26 64 50 68 Q74 64 72 26 Z M50 68 L50 100 M38 102 Q50 98 62 102",
      liquid: "M30 36 Q29 62 50 65 Q71 62 70 36 Z",
    },
    martini: {
      glass: "M16 28 L84 28 L50 66 Z M50 66 L50 100 M36 102 Q50 98 64 102",
      liquid: "M22 33 L78 33 L50 63 Z",
    },
    rocks: {
      glass: "M24 46 L76 46 L73 102 L27 102 Z M27 96 L73 96",
      liquid: "M25.5 58 L74.5 58 L72.4 95 L27.6 95 Z",
      ice: "M36 62 L52 59 L55 75 L39 78 Z",
    },
    highball: {
      glass: "M32 16 L68 16 L66 104 L34 104 Z M34 98 L66 98",
      liquid: "M32.8 30 L67.2 30 L66.1 97 L33.9 97 Z",
      ice: "M40 40 L54 38 L56 52 L42 54 Z M44 62 L58 60 L59 74 L45 75 Z",
    },
    wine: {
      glass: "M30 18 Q26 56 50 62 Q74 56 70 18 Z M50 62 L50 100 M36 102 Q50 98 64 102",
      liquid: "M29 36 Q29 57 50 59 Q71 57 71 36 Z",
    },
    flute: {
      glass: "M40 12 Q38 54 50 64 Q62 54 60 12 Z M50 64 L50 100 M40 102 Q50 98 60 102",
      liquid: "M40.6 24 Q40 52 50 60 Q60 52 59.4 24 Z",
    },
    mug: {
      glass: "M26 30 L66 30 L64 100 L28 100 Z M66 44 Q82 44 82 60 Q82 76 65 76",
      liquid: "M27 40 L65 40 L63.4 94 L28.6 94 Z",
    },
    punch: {
      glass: "M18 48 Q20 84 50 86 Q80 84 82 48 Z M38 86 L38 96 L62 96 L62 86",
      liquid: "M21 56 Q24 80 50 82 Q76 80 79 56 Z",
    },
  };
  function glassKey(g) {
    g = String(g || "").toLowerCase();
    if (/nick|nora/.test(g)) return "nick";
    if (/coupe|cocktail glass/.test(g)) return "coupe";
    if (/martini/.test(g)) return "martini";
    if (/high|collins|tall|libbey/.test(g)) return "highball";
    if (/flute|champ/.test(g)) return "flute";
    if (/wine|goblet/.test(g)) return "wine";
    if (/mug|tiki|julep|copper/.test(g)) return "mug";
    if (/punch|bowl|pitcher|batch/.test(g)) return "punch";
    return "rocks";
  }
  function glassSVG(d) {
    const g = GLASSES[glassKey(d.glass)];
    const col = drinkColor(d);
    const id = "l" + Math.random().toString(36).slice(2, 8);
    return (
      '<svg class="glass-art" viewBox="0 0 100 120" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + col + '" stop-opacity=".95"/>' +
      '<stop offset="1" stop-color="' + col + '" stop-opacity=".65"/></linearGradient></defs>' +
      '<path d="' + g.liquid + '" fill="url(#' + id + ')"/>' +
      (g.ice ? '<path d="' + g.ice + '" fill="#fff" fill-opacity=".22" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>' : "") +
      '<path d="' + g.glass + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  window.MS = {
    cfg, load, esc, yes, no, statusOf, onShelf, photoUrl, hostOf,
    ingredients, parseIngredient, glassSVG, drinkColor, recipes,
  };
})();
