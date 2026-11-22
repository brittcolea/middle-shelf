(async function () {
  const { esc, yes, no, onShelf, statusOf, photoUrl, hostOf, ingredients, drinkColor } = MS;
  const { scene, drinkArt, logo, arch } = MSArt;
  const $ = (s, el = document) => el.querySelector(s);
  const track = $(".track"), tabsEl = $(".tabs");

  const CODEX = ["Old-Fashioned", "Martini", "Daiquiri", "Sidecar", "Highball", "Flip"];
  const SPIRITS = [
    ["Whiskey", /whisk|bourbon|rye|scotch|irish/i], ["Gin", /\bgin\b/i], ["Rum", /rum|cacha/i],
    ["Agave", /tequila|mezcal|agave/i], ["Brandy", /brandy|cognac|calvados|pisco|armagnac/i], ["Vodka", /vodka/i],
  ];
  const SHELF_ORDER = ["Whiskey", "Gin", "Rum", "Agave", "Brandy", "Vodka", "Liqueur", "Amaro & Aperitivo", "Vermouth & Fortified", "Bitters", "Other"];
  const spiritOf = (d) => (SPIRITS.find(([, re]) => re.test(d.base_spirit || "")) || ["Liqueurs & More"])[0];

  const { data, source, at } = await MS.load(["Cocktails", "Recipe Ingredients", "Bottles", "Shelf Intros", "Settings", "Lists", "Styles"]);
  // Styles tab: row order sets the order of types on the Shelf pages; Shelf note is the line under each type.
  const STYLES = (data.Styles || []).filter((s) => s.style);
  const styleIdx = (name) => { const i = STYLES.findIndex((s) => s.style === name); return i < 0 ? 999 : i; };
  const styleNote = (name) => { const s = STYLES.find((x) => x.style === name); return s ? (s.shelf_note || "") : ""; };
  // "Hendrick's" -> "Hendrick's Modern Gin": add the bottle's type (Styles tab Menu label) unless the
  // name already says it. Words already in the name aren't repeated ("Rittenhouse Rye" -> "Rittenhouse Rye Whiskey").
  const BOTTLE_STYLE = {}; (data.Bottles || []).forEach((b) => { if (b.bottle) BOTTLE_STYLE[b.bottle] = b.style; });
  const menuLabel = (style) => { const s = STYLES.find((x) => x.style === style); return s ? (s.menu_label || s.style) : ""; };
  const wordsOf = (t) => String(t).toLowerCase().split(/[\s/]+/).map((w) => w.replace(/[^a-z0-9À-ɏ-]/g, "")).filter(Boolean);
  const fullName = (name) => {
    const label = menuLabel(BOTTLE_STYLE[name]);
    if (!name || !label) return name;
    const have = new Set(wordsOf(name)), lw = wordsOf(label);
    if (have.has(lw[lw.length - 1])) return name;
    const add = label.split(/\s+/).filter((w) => !have.has(wordsOf(w)[0]));
    return add.length ? name + " " + add.join(" ") : name;
  };
  const styleTitle = (name) => String(name || "").replace(/\s*\(.*?\)\s*/g, "").trim();
  // Keep the last two words together so a line never ends on a lone word.
  const tight = (s) => esc(s).replace(/ (\S+)$/, "&nbsp;$1");
  const S = {};
  data.Settings.forEach((r) => { if (r.setting) S[r.setting.toLowerCase()] = r.value; });
  const intros = {};
  data["Shelf Intros"].forEach((r) => { if (r.family) intros[r.family.toLowerCase()] = r.intro; });
  if (S["bar name"]) document.title = S["bar name"];

  // Family names, order, and blurbs come from the "Family: <name>" rows in Settings.
  // They line up, in order, with Cocktail Codex's six families, which pick the drawing
  // for each page and let older sheet values (e.g. "Daiquiri") still find their family.
  const settingFams = data.Settings.map((r) => /^family:\s*(.+)$/i.exec(r.setting || "")).filter(Boolean).map((m) => m[1].trim());
  const FAM_NAMES = settingFams.length ? settingFams : CODEX;
  const famOf = (d) => {
    const v = String(d.codex_family || d.family || "").trim();
    const i = FAM_NAMES.findIndex((f) => f.toLowerCase() === v.toLowerCase());
    if (i >= 0) return FAM_NAMES[i];
    const j = CODEX.findIndex((f) => f.toLowerCase() === v.toLowerCase());
    return j >= 0 && FAM_NAMES[j] ? FAM_NAMES[j] : "More";
  };
  const sceneFor = (f) => { const i = FAM_NAMES.indexOf(f); return i >= 0 && CODEX[i] ? CODEX[i] : f; };

  const ALL = data.Cocktails.filter((d) => d.name);
  const REC = MS.recipes(data["Recipe Ingredients"], data.Lists);
  // Grapefruit (juice, soda, liqueur) interacts with many medications, so those drinks carry a note.
  // Health notes shown under a drink, keyed off its ingredients.
  // Grapefruit (juice, soda, liqueur) interacts with many medications; raw egg carries a salmonella risk.
  const ADVISORIES = [
    [/grapefruit|pamplemousse/i, "Contains grapefruit, which can interfere with a wide range of medications."],
    [/^(egg white|egg yolk|whole egg)$/i, "Contains raw egg, which carries a small risk of foodborne illness. Ask for it without if you're pregnant or have a weakened immune system."],
  ];
  const advisoriesHTML = (d) => {
    const ings = ingsOf(d).map((x) => [x.type, x.item, x.bottle, x.pour]);
    return ADVISORIES.filter(([re]) => ings.some((parts) => parts.some((p) => re.test(String(p || "").trim()))))
      .map(([, text]) => `<p class="advisory">${text}</p>`).join("");
  };
  const ingsOf = (d) => REC[d.name] || ingredients(d.ingredients);
  // What the sheet's Status column says we'd have to buy for a drink.
  const missingOf = (d) => [...new Set((REC[d.name] || []).filter((x) => x.status === "Buy").map((x) => x.pour || x.bottle || x.type))];

  // Only drinks marked On menu = Yes ever show to guests.
  // Tonight's menu: those you can make right now with what's in stock (subs included).
  // Full menu: all of them, with missing ingredients flagged.
  let full = (() => { try { return localStorage.getItem("ms-full") === "1"; } catch (e) { return false; } })();
  let drinks = [];
  const pickDrinks = () => {
    const onMenu = ALL.filter((d) => yes(d.on_menu) && ((REC[d.name] || []).length || d.ingredients));
    drinks = full ? onMenu : onMenu.filter((d) => !missingOf(d).length);
  };
  // "a", "a and b", "a, b, and c" (always the serial comma)
  const listText = (a) => a.length < 2 ? (a[0] || "") : a.length === 2 ? a[0] + " and " + a[1]
    : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];
  // Pantry things (grenadine, cola, honey syrup) read lowercase; bottles and brands keep their capitals.
  const pantryNames = new Set((data.Lists || []).filter((l) => /pantry/i.test(l.kind || ""))
    .flatMap((l) => [l.ingredient, l.stocked_as]).filter(Boolean).map((s) => s.toLowerCase()));
  const nice = (s) => pantryNames.has(String(s).toLowerCase()) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const giftLine = (miss) =>
    `<p class="gift">We're out of ${esc(listText(miss.map((m) => nice(fullName(m)))))}. Bring some as a gift for the bar and the first one's yours.</p>`;
  const ingName = (x) => (x.bottle && (x.base || x.item) === x.bottle ? fullName(x.bottle) : (x.base || x.item));
  const ingHTML = (x) => esc((x.amt ? x.amt + " " : "") + ingName(x)) +
    (x.status === "Sub" && x.pour ? ` <span class="tag sub">subbed with ${esc(fullName(x.pour))}</span>` : "") +
    (x.status === "Buy" ? ' <span class="tag miss">missing</span>' : "");
  const bottles = data.Bottles.filter((b) => b.bottle && onShelf(b.status) && !no(b.show_on_menu));
  let grouping = (() => { try { return localStorage.getItem("ms-group"); } catch (e) { return null; } })() ||
    (/spirit/i.test(S["default grouping"] || "") ? "spirit" : "family");

  // ---------- Building blocks ----------
  const frame = (inner) =>
    `<div class="frame"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><i class="dots t"></i><i class="dots b"></i><div class="sheet">${inner}</div></div>`;
  const orn = '<div class="orn"><i></i></div>';
  const firstSentence = (t) => (String(t || "").match(/^.*?[.!?](\s|$)/) || [t || ""])[0].trim();

  function drinkHTML(d) {
    const ings = ingsOf(d);
    const house = yes(d.house_original);
    const how = /^(Shaken|Stirred|Built|Blended|Batched)$/.test(d.method || "") ? d.method : /shake/i.test(d.method) ? "Shaken" : /stir/i.test(d.method) ? "Stirred" : /build|top|pour/i.test(d.method) ? "Built" : /combine|pitcher|bowl/i.test(d.method) ? "Batched" : "";
    const meta = [d.glass, how, d.garnish && d.garnish !== "None" && d.garnish].filter(Boolean);
    const src = d.source || hostOf(d.source_url);
    const miss = missingOf(d);
    return `<li class="drink${miss.length ? " is-missing" : ""}" tabindex="0" data-i="${ALL.indexOf(d)}">
      <div class="dn">${esc(d.name)}${house ? '<span class="house-mark">House</span>' : ""}${yes(d.favorite) ? '<span class="fav-mark">★ Favorite</span>' : ""}</div>
      ${d.description ? `<p class="dd">${esc(d.description)}</p>` : ""}
      <p class="di">${ings.map(ingHTML).join('<span class="sep">·</span>')}</p>
      ${miss.length ? giftLine(miss) : ""}
      ${advisoriesHTML(d)}
      <p class="dm">${meta.map(esc).join(" · ")}${src && !house ? " · via " + esc(src) : ""}${photoUrl(d.photo_url) ? ' <span class="cam">◉ photo</span>' : ""}</p>
    </li>`;
  }

  function groupSwitch() {
    return `<div class="group-switch">Group by
      <button data-g="family" aria-pressed="${grouping === "family"}">Family</button>
      <button data-g="spirit" aria-pressed="${grouping === "spirit"}">Spirit</button></div>`;
  }

  // House originals first, then favorites, then everything else (sheet order otherwise).
  const rank = (d) => (yes(d.house_original) ? 0 : yes(d.favorite) ? 1 : 2);
  const rankFirst = (list) => list.map((d, i) => [d, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);

  function cocktailPage(id, title, sceneKey, blurb, list) {
    return {
      id, tab: title, kind: "cocktails",
      html: `<div class="inner">${frame(
        arch(title) + scene(sceneKey, title) + (blurb ? `<p class="blurb">${tight(blurb)}</p>` : "") +
        `<ol class="drinks">${rankFirst(list).map(drinkHTML).join("")}</ol>`)}</div>`,
    };
  }

  function buildPages() {
    const pages = [];
    // Cover is filled in after we know the other pages (for the contents list).
    pages.push({ id: "welcome", tab: "home", kind: "cover", html: "" });

    const house = drinks.filter((d) => yes(d.house_original));
    if (house.length) pages.push(cocktailPage("house", "House Originals", "house", S["house originals note"], house));

    if (grouping === "family") {
      [...FAM_NAMES, "More"].forEach((f) => {
        const list = drinks.filter((d) => famOf(d) === f);
        if (list.length) pages.push(cocktailPage("fam-" + f.toLowerCase().replace(/\W+/g, "-"), f === "More" ? "More Drinks" : f,
          sceneFor(f), S["family: " + f.toLowerCase()], list));
      });
    } else {
      [...SPIRITS.map((s) => s[0]), "Liqueurs & More"].forEach((sp) => {
        const list = drinks.filter((d) => spiritOf(d) === sp);
        if (list.length) pages.push(cocktailPage("sp-" + sp.toLowerCase().replace(/\W+/g, "-"), sp, sp === "Liqueurs & More" ? "liqueur" : sp,
          firstSentence(intros[sp.toLowerCase()]), list));
      });
    }

    const fams = [...new Set([...SHELF_ORDER, ...bottles.map((b) => b.family || "Other")])];
    fams.forEach((fam) => {
      const list = bottles.filter((b) => (b.family || "Other") === fam)
        .sort((a, b) => styleIdx(a.style) - styleIdx(b.style) || a.bottle.localeCompare(b.bottle));
      if (!list.length) return;
      // Group by style, in Styles-tab order, each with its heading and shelf note.
      const groups = [];
      list.forEach((b) => {
        const st = b.style || fam;
        if (!groups.length || groups[groups.length - 1].style !== st) groups.push({ style: st, items: [] });
        groups[groups.length - 1].items.push(b);
      });
      const bottleLi = (b) => `<li><span class="bn">${esc(b.bottle)}</span>${statusOf(b.status) === "low" ? '<span class="last">Last pours</span>' : ""}
        ${b.guest_note ? `<span class="bnote">${esc(b.guest_note)}</span>` : ""}</li>`;
      pages.push({
        id: "shelf-" + fam.toLowerCase().replace(/\W+/g, "-"), tab: fam.replace(" & ", " & "), kind: "shelf",
        html: `<div class="inner">${orn}${arch(fam)}${scene(fam, fam)}
          ${intros[fam.toLowerCase()] ? `<p class="intro">${tight(intros[fam.toLowerCase()])}</p>` : ""}
          ${groups.map((g) => `<section class="stype">
            <h3 class="st-name">${esc(styleTitle(g.style))}</h3>
            ${styleNote(g.style) ? `<p class="st-note">${tight(styleNote(g.style))}</p>` : ""}
            <ul class="bottles">${g.items.map(bottleLi).join("")}</ul></section>`).join("")}
          ${orn}</div>`,
      });
    });

    const contents = (kind) => pages.filter((p) => p.kind === kind)
      .map((p) => `<li><button data-go="${p.id}">${esc(p.tab)}<span>${p.kind === "cocktails" ? (p.html.match(/class="drink[ "]/g) || []).length : ""}</span></button></li>`).join("");
    pages[0].html = `<div class="inner cover">${orn}${logo()}
      ${S["tagline"] ? `<p class="tagline">${tight(S["tagline"])}</p>` : ""}
      <p class="choose">Browse the cocktails by</p>
      <div class="choice"><button data-g="family" aria-pressed="${grouping === "family"}">Family</button><button data-g="spirit" aria-pressed="${grouping === "spirit"}">Spirit</button></div>
      <p class="choose">Show</p>
      <div class="choice"><button data-full="0" aria-pressed="${!full}">Tonight's menu</button><button data-full="1" aria-pressed="${full}">Full menu</button></div>
      ${full ? `<p class="full-note">${tight(S["full menu note"] || "The full menu includes drinks we can't make tonight. If one's missing something, bring it as a gift for the bar and the first one's yours.")}</p>` : ""}
      <div class="contents"><div><h3>Cocktails</h3><ul>${contents("cocktails")}</ul></div><div><h3>On the Shelf</h3><ul>${contents("shelf")}</ul></div></div>
      <p class="swipe">Swipe sideways or use the tabs up top →</p>
      ${orn}
      <div class="status">${source === "live" ? '<span class="live">Poured live from the shelf</span>' : '<span class="stale">Showing a saved copy' + (at ? " from " + new Date(at).toLocaleDateString() : "") + "</span>"}</div>
      <div class="credit">${esc(S["footer note"] || "Style notes adapted from Cocktail Codex by Alex Day, Nick Fauchald, and David Kaplan.")}</div>
    </div>`;
    return pages;
  }

  // ---------- Render + navigation ----------
  let pages = [], current = 0;
  const HOME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7 Q5 13 12 13.5 Q19 13 19 7 Z M12 13.5 V18 M8.5 19.5 Q12 18 15.5 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 21.5 H22" stroke="currentColor" stroke-width="1.8"/></svg>';

  function render(keepId) {
    pickDrinks();
    pages = buildPages();
    track.innerHTML = pages.map((p) => `<section class="page" id="p-${p.id}" aria-label="${esc(p.tab === "home" ? "Welcome" : p.tab)}">${p.html}</section>`).join("");
    let lastKind = "";
    tabsEl.innerHTML = pages.map((p, i) => {
      let pre = "";
      if (p.kind !== lastKind && p.kind !== "cover") pre = `<span class="tgroup">${p.kind === "shelf" ? "On the Shelf" : "Cocktails"}</span>`;
      lastKind = p.kind;
      return pre + `<button class="tab${p.kind === "cover" ? " home" : ""}" role="tab" data-i="${i}" aria-label="${esc(p.tab === "home" ? "Welcome" : p.tab)}">${p.kind === "cover" ? HOME_ICON : esc(p.tab)}</button>`;
    }).join("");
    const idx = Math.max(0, pages.findIndex((p) => p.id === keepId));
    current = -1;
    const jump = () => {
      track.style.scrollSnapType = "none";
      track.scrollLeft = idx * track.clientWidth;
      track.style.scrollSnapType = "";
      setActive(idx);
    };
    jump();
    setTimeout(jump, 60); // again once fonts and art have settled
  }

  function setActive(i) {
    current = i;
    tabsEl.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", +t.dataset.i === i));
    const t = tabsEl.querySelector(`.tab[data-i="${i}"]`);
    if (t) tabsEl.scrollTo({ left: t.offsetLeft - tabsEl.clientWidth / 2 + t.offsetWidth / 2, behavior: "smooth" });
    const id = pages[i] && pages[i].id;
    if (id) history.replaceState(null, "", i === 0 ? location.pathname : "#" + id);
  }
  function go(i, smooth = true) {
    i = Math.max(0, Math.min(pages.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? "smooth" : "auto" });
    setActive(i);
  }

  let tick;
  track.addEventListener("scroll", () => {
    clearTimeout(tick);
    tick = setTimeout(() => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i !== current) setActive(i);
    }, 50);
  }, { passive: true });
  window.addEventListener("resize", () => track.scrollTo({ left: current * track.clientWidth }));
  tabsEl.addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) go(+t.dataset.i); });
  document.addEventListener("keydown", (e) => {
    if ($("dialog.detail").open) return;
    if (e.key === "ArrowRight") go(current + 1);
    if (e.key === "ArrowLeft") go(current - 1);
  });

  track.addEventListener("click", (e) => {
    const g = e.target.closest("[data-g]");
    if (g) {
      grouping = g.dataset.g;
      try { localStorage.setItem("ms-group", grouping); } catch (err) {}
      const onCover = current === 0;
      render(onCover ? "welcome" : "house");
      return;
    }
    const fb = e.target.closest("[data-full]");
    if (fb) {
      full = fb.dataset.full === "1";
      try { localStorage.setItem("ms-full", full ? "1" : "0"); } catch (err) {}
      render("welcome");
      return;
    }
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) { go(pages.findIndex((p) => p.id === goBtn.dataset.go)); return; }
    const card = e.target.closest(".drink");
    if (card) openDrink(ALL[+card.dataset.i]);
  });
  track.addEventListener("keydown", (e) => {
    const card = e.target.closest(".drink");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDrink(ALL[+card.dataset.i]); }
  });

  // ---------- Drink detail ----------
  const dlg = $("dialog.detail");
  // "Codex uses <brand>" notes on the Codex tabs are for the owner, not guests.
  const guestNote = (n) => String(n || "").split(/;\s*/).filter((p) => p && !/^Codex uses /.test(p)).join("; ");
  function openDrink(d) {
    const img = photoUrl(d.photo_url);
    const by = d.created_by && !/^(classic|cocktail codex)$/i.test(d.created_by) ? d.created_by : "";
    const src = [d.source || hostOf(d.source_url), by ? "(" + by + ")" : ""].filter(Boolean).join(" ");
    const facts = [["Glass", d.glass], ["Method", d.method], ["Garnish", d.garnish], ["Family", famOf(d) === "More" ? "" : famOf(d)]].filter((f) => f[1]);
    $(".d-content", dlg).innerHTML =
      `<div class="d-art">${img ? `<img alt="${esc(d.name)}" src="${esc(img)}">` : drinkArt(d, drinkColor(d))}</div>
      <div class="d-body"><div class="dn">${esc(d.name)}${yes(d.house_original) ? '<span class="house-mark">House</span>' : ""}${yes(d.favorite) ? '<span class="fav-mark">★ Favorite</span>' : ""}</div>
      ${d.description ? `<p class="dd">${esc(d.description)}</p>` : ""}
      <table class="spec">${ingsOf(d).map((x) => `<tr><td class="amt">${esc(x.amt)}</td><td>${esc(ingName(x))}${guestNote(x.note) ? `<span class="inote">, ${esc(guestNote(x.note))}</span>` : ""}${x.status === "Sub" && x.pour ? ` <span class="tag sub">subbed with ${esc(fullName(x.pour))}</span>` : ""}${x.status === "Buy" ? ' <span class="tag miss">missing</span>' : ""}</td></tr>`).join("")}</table>
      ${missingOf(d).length ? giftLine(missingOf(d)) : ""}
      ${advisoriesHTML(d)}
      ${d.instructions ? `<p class="instr">${esc(d.instructions)}</p>` : ""}
      ${facts.length ? `<dl class="facts">${facts.map((f) => `<dt>${f[0]}</dt><dd>${esc(f[1])}</dd>`).join("")}</dl>` : ""}
      ${src ? `<p class="src">Recipe: ${d.source_url ? `<a href="${esc(d.source_url)}" target="_blank" rel="noopener">${esc(src)}</a>` : esc(src)}</p>` : ""}</div>`;
    dlg.showModal();
    dlg.scrollTop = 0;
  }
  $(".close", dlg).addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  await (document.fonts && document.fonts.ready);
  render(location.hash.slice(1) || "welcome");
})();
