# The Middle Shelf

A home-bar menu that reads from a Google Sheet.

- `index.html`: the guest menu (what the QR code opens). Swipe between pages; cocktails can be grouped by Cocktail Codex family or by spirit, and the back pages list the bottles on the shelf.
- `owner.html`: the Back Bar dashboard (stock, menu check, restock, wishlist, Codex picks, ratings). Not linked from the guest menu.
- `print.html`: a 4 × 6 in QR table card.

## Editing the menu

Everything comes from the Google Sheet set in `config.js`. Edit the sheet and refresh the page. The sheet must stay shared as "Anyone with the link: Viewer". See the sheet's Read Me tab for what each column does.

If the sheet can't be reached (or you open `index.html` straight from your computer), the menu shows the saved copy in `data/snapshot.js`. To preview locally with live data, run `npx http-server . -p 5178` in this folder and open http://localhost:5178.

## Rebuilding the sheet

`tools/rebuild_sheet.py` was a one-time conversion from the original sheet layout (ingredients as text) to the current one (Recipe Ingredients tab with dropdowns). It refuses to run against the current layout. All changes now happen directly in Google Sheets.

`tools/refresh_snapshot.mjs` updates `data/snapshot.js` (the saved copy shown when the sheet can't be reached) from the live sheet: `node tools/refresh_snapshot.mjs`.

## Files

- `assets/core.js`: loads the sheet tabs as CSV and shared helpers.
- `assets/art.js`: the ink-and-stipple drawings (logo, section scenes, glasses).
- `assets/menu.js`, `assets/menu.css`: the guest menu.
- `assets/owner.js`: the dashboard.

After changing a file in `assets/`, bump the `?v=` number on its `<script>` or `<link>` tag so phones pick up the new version.

Style notes on the shelf pages are paraphrased from *Cocktail Codex* by Alex Day, Nick Fauchald and David Kaplan.
