(async function () {
  const { esc, yes, onShelf, statusOf, ingredients } = MS;
  const $ = (s) => document.querySelector(s);
  if (MS.cfg.sheetUrl) $("#edit").href = MS.cfg.sheetUrl;

  const { data, source } = await MS.load(["Cocktails", "Recipe Ingredients", "Bottles", "Pantry", "Lists", "Codex Picks", "Settings"]);
  const bottles = data.Bottles.filter((b) => b.bottle);
  const pantry = data.Pantry.filter((p) => p.item);
  const drinks = data.Cocktails.filter((d) => d.name);
  const picks = data["Codex Picks"].filter((p) => p.bottle);

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const shelfText = bottles.filter((b) => onShelf(b.status)).map((b) => norm([b.bottle, b.style, b.family].join(" ")));
  const pantryText = pantry.filter((p) => onShelf(p.status) || !p.status).map((p) => norm(p.item));

  // Menu check: every ingredient row of a drink must be available.
  //  - a picked Bottle must itself be In stock or Low
  //  - otherwise any bottle whose Style matches the Ingredient counts
  //  - pantry ingredients use the "Stocked as" item from the Lists tab
  const REC = MS.recipes(data["Recipe Ingredients"], data.Lists);
  const lists = data.Lists || [];
  const stockedAs = {}; const kindOf = {};
  lists.forEach((l) => { if (l.ingredient) { kindOf[l.ingredient] = (l.kind || "").toLowerCase(); stockedAs[l.ingredient] = l.stocked_as || l.ingredient; } });
  const onShelfBottles = bottles.filter((b) => onShelf(b.status));
  const pantryOk = (name) => pantry.some((p) => norm(p.item) === norm(name) && (onShelf(p.status) || !p.status));
  function missing(d) {
    const rows = REC[d.name] || [];
    // Prefer the sheet's own Status column so the dashboard and the sheet always agree.
    if (rows.some((r) => r.status)) return rows.filter((r) => r.status === "Buy").map((r) => r.pour || r.bottle || r.type);
    return rows.filter((r) => {
      if (r.bottle) return !onShelfBottles.some((b) => b.bottle === r.bottle);
      if (kindOf[r.type] === "pantry") return !pantryOk(stockedAs[r.type]);
      return !onShelfBottles.some((b) => (b.style || "") === r.type);
    }).map((r) => r.bottle || r.type);
  }

  const rateColor = (r) => {
    const x = Math.max(0, Math.min(10, r));
    const hue = x <= 5 ? (x / 5) * 45 : 45 + ((x - 5) / 5) * 75; // red -> amber -> green
    return "hsl(" + hue + " 60% 58%)";
  };
  const rateHTML = (v) => {
    const r = parseFloat(v);
    return isNaN(r) ? '<span class="rate none">–</span>' : '<span class="rate" style="background:' + rateColor(r) + '">' + r + "</span>";
  };
  const pill = (s) => '<span class="pill s-' + statusOf(s) + '">' + esc(s || "?") + "</span>";

  const onMenu = drinks.filter((d) => yes(d.on_menu));
  const menuIssues = onMenu.map((d) => ({ d, m: missing(d) })).filter((x) => x.m.length);
  const ready = drinks.filter((d) => !yes(d.on_menu) && (REC[d.name] || []).length && !missing(d).length);
  const restock = bottles.filter((b) => ["low", "out"].includes(statusOf(b.status)));
  const pantryRestock = pantry.filter((p) => ["low", "out"].includes(statusOf(p.status)));
  const wish = bottles.filter((b) => statusOf(b.status) === "wish")
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[(a.priority || "").toLowerCase()] ?? 3) - ({ high: 0, medium: 1, low: 2 }[(b.priority || "").toLowerCase()] ?? 3));
  const ownedText = bottles.filter((b) => !["wish", "tried"].includes(statusOf(b.status))).map((b) => norm(b.bottle));
  const recs = picks.filter((p) => {
    const k = norm(p.match || p.bottle);
    return !ownedText.some((t) => t.includes(k) || k.includes(t));
  });

  const count = (st) => bottles.filter((b) => statusOf(b.status) === st).length;

  let famFilter = "All", statusFilter = "On shelf", sortKey = "rating";
  const fams = ["All", ...new Set(bottles.map((b) => b.family || "Other"))];
  const statuses = ["On shelf", "All", "In stock", "Low", "Out", "Wishlist", "Tried"];

  function ratingsTable() {
    let list = bottles.filter((b) => famFilter === "All" || (b.family || "Other") === famFilter);
    if (statusFilter === "On shelf") list = list.filter((b) => onShelf(b.status));
    else if (statusFilter !== "All") list = list.filter((b) => (b.status || "").toLowerCase() === statusFilter.toLowerCase());
    list = [...list].sort((a, b) => sortKey === "rating"
      ? (parseFloat(b.rating) || -1) - (parseFloat(a.rating) || -1)
      : String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")));
    return '<div class="scroll"><table class="tbl"><thead><tr>' +
      '<th data-k="rating">Rating</th><th data-k="bottle">Bottle</th><th data-k="style" class="hide-sm">Style</th><th data-k="status">Status</th><th class="hide-sm">Notes</th>' +
      "</tr></thead><tbody>" +
      (list.map((b) => "<tr><td>" + rateHTML(b.rating) + "</td><td>" + esc(b.bottle) +
        '<div class="muted">' + esc(b.family || "") + "</div></td>" +
        '<td class="hide-sm muted">' + esc(b.style || "") + "</td><td>" + pill(b.status) + "</td>" +
        '<td class="notes hide-sm">' + esc(b.tasting_notes || "") + (b.grant_s_notes ? '<div class="muted">Grant: ' + esc(b.grant_s_notes) + "</div>" : "") + "</td></tr>").join("") ||
        '<tr><td colspan="5" class="muted">Nothing here.</td></tr>') +
      "</tbody></table></div>";
  }

  function render() {
    $("#app").innerHTML =
      '<div class="tiles">' +
      [["On the shelf", count("in") + count("low")], ["Running low", count("low")], ["Out", count("out")],
       ["Wishlist", count("wish")], ["Drinks on menu", onMenu.length], ["Menu problems", menuIssues.length]]
        .map(([l, n]) => '<div class="tile"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>").join("") +
      "</div>" +

      '<div class="grid2">' +
      '<section class="panel"><h2>Menu check</h2><p class="hint">Drinks marked “On menu” that need something you don’t have on the shelf right now.</p>' +
      (menuIssues.length ? '<ul class="rows">' + menuIssues.map(({ d, m }) =>
        '<li><span class="grow">' + esc(d.name) + '<span class="sub miss">Missing: ' + m.map(esc).join(", ") + "</span></span></li>").join("") + "</ul>"
        : '<p class="hint">Everything on the menu can be made right now.</p>') + "</section>" +

      '<section class="panel"><h2>Restock</h2><p class="hint">Bottles and pantry items marked Low or Out.</p>' +
      ((restock.length + pantryRestock.length) ? '<ul class="rows">' +
        restock.map((b) => '<li><span class="grow">' + esc(b.bottle) + '<span class="sub">' + esc(b.style || b.family || "") + "</span></span>" + rateHTML(b.rating) + pill(b.status) + "</li>").join("") +
        pantryRestock.map((p) => '<li><span class="grow">' + esc(p.item) + '<span class="sub">' + esc(p.type || "Pantry") + "</span></span>" + pill(p.status) + "</li>").join("") +
        "</ul>" : '<p class="hint">Nothing low. Nice.</p>') + "</section>" +
      "</div>" +

      '<div class="grid2">' +
      '<section class="panel"><h2>Wishlist</h2><p class="hint">Bottles you marked Wishlist, by priority.</p>' +
      (wish.length ? '<ul class="rows">' + wish.map((b) =>
        '<li><span class="grow">' + esc(b.bottle) + '<span class="sub">' + esc([b.style, b.tasting_notes].filter(Boolean).join(" · ")) + "</span></span>" +
        (b.priority ? '<span class="pill s-wish">' + esc(b.priority) + "</span>" : "") + "</li>").join("") + "</ul>" : '<p class="hint">Empty.</p>') +
      "</section>" +

      '<section class="panel"><h2>Cocktail Codex picks you don’t have</h2><p class="hint">Bottles the book reaches for. Add one to your Bottles tab as Wishlist to track it.</p>' +
      (recs.length ? '<ul class="rows">' + recs.map((p) =>
        '<li><span class="grow">' + esc(p.bottle) + '<span class="sub">' + esc(p.style || "") + (p.why ? " · " + esc(p.why) : "") + "</span></span></li>").join("") + "</ul>"
        : '<p class="hint">You own every pick. Impressive.</p>') + "</section>" +
      "</div>" +

      '<section class="panel"><h2>Ready to add to the menu</h2><p class="hint">Drinks in your Cocktails tab that are off the menu but fully stocked.</p>' +
      (ready.length ? '<ul class="rows">' + ready.map((d) =>
        '<li><span class="grow">' + esc(d.name) + '<span class="sub">' + (REC[d.name] || []).map((x) => esc(x.item)).join(" · ") + "</span></span>" + rateHTML(d.my_rating) + "</li>").join("") + "</ul>"
        : '<p class="hint">Nothing new is makeable yet.</p>') + "</section>" +

      '<section class="panel" id="ratings"><h2>Ratings</h2><p class="hint">Your 1–10 scores (red is a skip, green is a favorite). Change them in the Bottles tab.</p>' +
      '<div class="filters" id="ff">' + fams.map((f) => '<button class="chip" aria-pressed="' + (f === famFilter) + '">' + esc(f) + "</button>").join("") + "</div>" +
      '<div class="filters" id="sf">' + statuses.map((f) => '<button class="chip" aria-pressed="' + (f === statusFilter) + '">' + esc(f) + "</button>").join("") + "</div>" +
      '<div id="rt">' + ratingsTable() + "</div></section>";

    $("#ff").onclick = (e) => { const b = e.target.closest(".chip"); if (b) { famFilter = b.textContent; render(); } };
    $("#sf").onclick = (e) => { const b = e.target.closest(".chip"); if (b) { statusFilter = b.textContent; render(); } };
    $("#rt").onclick = (e) => { const th = e.target.closest("th[data-k]"); if (th) { sortKey = th.dataset.k; $("#rt").innerHTML = ratingsTable(); } };
  }
  render();

  $("#status").innerHTML = source === "live"
    ? '<span class="live">Live from the Google Sheet</span>'
    : '<span class="stale">Could not reach the sheet; showing a saved copy</span>';
})();
