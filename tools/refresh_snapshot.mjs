// Refreshes data/snapshot.js (the saved copy the menu shows when the live sheet
// can't be reached) from the live Google Sheet. Guest-safe fields only.
// Usage: node tools/refresh_snapshot.mjs
import { readFileSync, writeFileSync } from "node:fs";

const cfg = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const sheetId = cfg.match(/sheetId:\s*"([^"]+)"/)[1];

function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const key = (h) => h.replace(/\(.*?\)/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
async function tab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
  const rows = parseCSV(await (await fetch(url)).text());
  const ks = rows[0].map(key);
  return rows.slice(1).map((r) => Object.fromEntries(ks.map((k, i) => [k, (r[i] || "").trim()])))
    .filter((o) => Object.values(o).some(Boolean));
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

const cocktails = (await tab("Cocktails")).filter((d) => /^yes$/i.test(d.on_menu));
const names = new Set(cocktails.map((d) => d.name));
const snap = {
  Cocktails: cocktails.map((d) => { const { my_rating, notes, ...rest } = d; return rest; }),
  "Recipe Ingredients": (await tab("Recipe Ingredients")).filter((r) => names.has(r.drink)),
  Bottles: (await tab("Bottles")).filter((b) => /^(in stock|low)$/i.test(b.status) && !/^no$/i.test(b.show_on_menu))
    .map((b) => pick(b, ["bottle", "family", "style", "status", "guest_note", "show_on_menu"])),
  "Shelf Intros": await tab("Shelf Intros"),
  Settings: await tab("Settings"),
  Lists: (await tab("Lists")).map((l) => pick(l, ["ingredient", "kind", "stocked_as"])).filter((l) => l.ingredient),
};
writeFileSync(new URL("../data/snapshot.js", import.meta.url),
  "// Saved copy of the menu, used when the live sheet can't be reached.\nwindow.MS_SNAPSHOT = " + JSON.stringify(snap) + ";\n");
console.log(`snapshot: ${snap.Cocktails.length} drinks, ${snap["Recipe Ingredients"].length} ingredient rows, ${snap.Bottles.length} bottles`);
