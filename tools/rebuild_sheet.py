"""Rebuild the Middle Shelf workbook from the LIVE sheet (keeps the owner's edits).

Usage: python build_v3.py <live_csv_dir> <out_xlsx> <snapshot_js>
"""
import csv, json, os, re, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import ColorScaleRule, FormulaRule
from openpyxl.utils import get_column_letter

LIVE, OUT, SNAP = sys.argv[1], sys.argv[2], sys.argv[3]

def read(tab):
    with open(os.path.join(LIVE, tab + ".csv"), encoding="utf-8") as f:
        rows = list(csv.reader(f))
    head = rows[0]
    return head, [dict(zip(head, r)) for r in rows[1:] if any(c.strip() for c in r)]

c_head, cocktails = read("Cocktails")
b_head, bottles = read("Bottles")
p_head, pantry = read("Pantry")
_, settings = read("Settings")
_, intros = read("Shelf Intros")
_, styles = read("Styles")
_, picks = read("Codex Picks")

# ---------- New styles needed by the added recipes ----------
EXTRA_STYLES = [
    ("Sotol", "Agave", "A cousin of mezcal from northern Mexico, distilled from the desert spoon plant rather than agave. Grassy, herbal and lightly smoky; reposado versions pick up vanilla from the barrel.", "", "General"),
    ("Cinnamon Liqueur", "Liqueur", "Sweet liqueur flavored with cinnamon bark. Warm and candy-like; use it in small amounts.", "", "General"),
    ("Anisette", "Liqueur", "Sweet anise-flavored liqueur, softer and sweeter than absinthe. Licorice-forward.", "", "General"),
    ("Honeysuckle Liqueur", "Liqueur", "Floral liqueur with a honeyed, nectar-like sweetness.", "", "General"),
    ("Tiki Bitters", "Bitters", "Aromatic bitters built on tropical baking spices like cinnamon and allspice. A dash adds tiki warmth to sours.", "", "General"),
]
style_names = [s["Style"] for s in styles]
for s in EXTRA_STYLES:
    if s[0] not in style_names:
        styles.append(dict(zip(["Style", "Family", "Profile", "Codex picks", "Source"], s)))
        style_names.append(s[0])

# ---------- Pantry: ingredient names -> the pantry row that covers them ----------
PANTRY_TYPES = [
    ("Lime juice", "Limes"), ("Lemon juice", "Lemons"), ("Orange juice", "Oranges"), ("Grapefruit juice", "Grapefruit"),
    ("Pineapple juice", "Pineapple juice"), ("Cranberry juice", "Cranberry juice"), ("Tart cherry juice", "Tart cherry juice"),
    ("Apple cider", "Apple cider"), ("Simple syrup", "Simple syrup"), ("Rich demerara syrup", "Demerara syrup"),
    ("Honey syrup", "Honey syrup"), ("Honey-ginger syrup", "Honey-ginger syrup"), ("Orgeat", "Orgeat"),
    ("Grenadine", "Grenadine"), ("Raspberry syrup", "Raspberry syrup"), ("Blackberry syrup", "Blackberry syrup"),
    ("Egg white", "Eggs"), ("Whole egg", "Eggs"), ("Egg yolk", "Eggs"), ("Heavy cream", "Heavy cream"), ("Whole milk", "Whole milk"),
    ("Soda water", "Soda water"), ("Tonic water", "Tonic"), ("Ginger ale", "Ginger ale"), ("Ginger beer", "Ginger beer"),
    ("Cola", "Cola"), ("Lemon-lime soda", "Lemon-lime soda"), ("Red wine", "Red wine (for floats)"), ("Sparkling wine", "Sparkling wine"),
    ("Mint", "Mint"), ("Luxardo cherries", "Luxardo cherries"), ("Lemon wedges", "Lemons"), ("Orange slices", "Oranges"),
    ("Cinnamon", "Cinnamon"), ("Nutmeg", "Nutmeg"), ("Salt", "Salt"), ("Sugar", "Sugar"), ("Tabasco", "Tabasco"),
    ("Vanilla extract", "Vanilla extract"), ("Mulling spices", "Mulling spices"), ("Pomegranate arils", "Pomegranate arils"),
]
have_pantry = {p["Item"] for p in pantry}
for _, item in PANTRY_TYPES:
    if item not in have_pantry:
        pantry.append({"Item": item, "Type": "Other", "Status": "", "House-made": "", "Recipe / notes": ""})
        have_pantry.add(item)
pantry_type_names = [t for t, _ in PANTRY_TYPES]

# ---------- Turning old "3/4 oz bourbon" text into structured rows ----------
bottle_names = [b["Bottle"] for b in bottles]
BRAND_KEYS = {  # text fragment -> exact bottle name in the Bottles tab
    "elijah craig small batch": "Elijah Craig Small Batch", "plymouth": "Plymouth Gin", "pierre ferrand ambre": "Pierre Ferrand Ambre",
    "pierre ferrand dry cura": "Pierre Ferrand Dry Curaçao", "cointreau": "Cointreau", "amaro nonino": "Amaro Nonino", "aperol": "Aperol",
    "appleton": "Appleton Estate Signature", "hamilton": "Hamilton Jamaican Pot Still Gold", "rittenhouse": "Rittenhouse Rye",
    "luxardo maraschino": "Luxardo Maraschino", "campari": "Campari", "licor 43": "Licor 43", "angostura": "Angostura Bitters",
    "mr black": "Mr Black Coffee Liqueur", "tanqueray": "Tanqueray",
}
TYPE_KEYS = [  # (regex on lowercase text, ingredient type)
    (r"^ginger$", "Mulling spices"), (r"^orange$", "Orange slices"), (r"base spirit", "Cognac"),
    (r"islay", "Islay Scotch"), (r"blended scotch|scotch", "Blended Scotch"), (r"irish", "Irish Whiskey"),
    (r"bourbon", "Bourbon"), (r"\brye\b", "Rye Whiskey"),
    (r"plymouth", "Plymouth Gin"), (r"london dry|\bgin\b", "London Dry Gin"),
    (r"spiced rum", "Spiced Rum"), (r"jamaica|appleton|hamilton", "Jamaican Rum"), (r"white rum|light rum|\brum\b", "Light Rum"),
    (r"reposado tequila|reposado", "Reposado Tequila"), (r"sotol", "Sotol"), (r"tequila", "Blanco Tequila"), (r"mezcal", "Mezcal"),
    (r"cognac|brandy", "Cognac"), (r"vodka", "Vodka"),
    (r"amaretto", "Amaretto"), (r"amaro", "Amaro"), (r"aperol", "Aperol"), (r"campari", "Campari"),
    (r"dry cura|cura[cç]ao", "Dry Curaçao"), (r"cointreau|triple sec|orange liqueur|grand marnier", "Orange Liqueur"),
    (r"maraschino liqueur|luxardo maraschino|maraschino(?! cherr)", "Maraschino Liqueur"), (r"green chartreuse|chartreuse", "Green Chartreuse"),
    (r"coffee liqueur|kahl", "Coffee Liqueur"), (r"licor 43", "Licor 43"), (r"elderflower|st-germain", "Elderflower Liqueur"),
    (r"apricot liqueur|pear liqueur", "Berry, Stone Fruit & Pear Liqueurs"), (r"honeysuckle", "Honeysuckle Liqueur"),
    (r"cinnamon liqueur", "Cinnamon Liqueur"), (r"anisette", "Anisette"), (r"absinthe", "Absinthe"),
    (r"sherry", "Sherry - Oloroso"), (r"sweet vermouth", "Sweet Vermouth"), (r"dry vermouth", "Dry Vermouth"),
    (r"tiki bitters", "Tiki Bitters"), (r"orange bitters", "Orange Bitters"), (r"peychaud", "Peychaud's Bitters"), (r"angostura|aromatic bitters", "Aromatic Bitters"),
    (r"lime juice|^lime$", "Lime juice"), (r"lemon wedge", "Lemon wedges"), (r"lemon juice|lemonade", "Lemon juice"),
    (r"grapefruit", "Grapefruit juice"), (r"orange juice", "Orange juice"), (r"blood orange|orange, sliced|orange slice", "Orange slices"),
    (r"pineapple", "Pineapple juice"), (r"cranberry", "Cranberry juice"), (r"tart cherry", "Tart cherry juice"), (r"cider", "Apple cider"),
    (r"honey-ginger", "Honey-ginger syrup"), (r"honey", "Honey syrup"), (r"demerara", "Rich demerara syrup"),
    (r"raspberry", "Raspberry syrup"), (r"blackberry", "Blackberry syrup"), (r"orgeat", "Orgeat"), (r"grenadine", "Grenadine"),
    (r"rich syrup|simple syrup|syrup", "Simple syrup"),
    (r"egg white", "Egg white"), (r"egg yolk", "Egg yolk"), (r"\begg\b", "Whole egg"),
    (r"cream", "Heavy cream"), (r"milk", "Whole milk"),
    (r"soda water|club soda|seltzer|\bsoda\b", "Soda water"), (r"tonic", "Tonic water"), (r"ginger ale", "Ginger ale"), (r"ginger beer", "Ginger beer"),
    (r"7up|lemon-lime", "Lemon-lime soda"), (r"\bcola\b", "Cola"), (r"red wine", "Red wine"), (r"sparkling|prosecco|cava", "Sparkling wine"),
    (r"\bwine\b", "Red wine"), (r"mint", "Mint"), (r"luxardo cherr|maraschino cherr|cherries", "Luxardo cherries"),
    (r"cinnamon", "Cinnamon"), (r"nutmeg", "Nutmeg"), (r"tabasco", "Tabasco"), (r"vanilla", "Vanilla extract"),
    (r"mulling|clove", "Mulling spices"), (r"pomegranate", "Pomegranate arils"),
]
FRAC = {"½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3"}
UNITS = r"(oz|dash(?:es)?|tsp|Tbsp|barspoons?|cups?|leaves|bottle|splash|sprigs?|whole)"
AMT_RE = re.compile(r"^((?:\d+\s+)?\d+/\d+|\d+(?:\.\d+)?|1-2)\s*" + UNITS + r"?\.?\s+(.*)$", re.I)

def parse_line(line):
    line = line.strip()
    for k, v in FRAC.items(): line = line.replace(k, v)
    if not line: return None
    amt, unit, rest = "", "", line
    m = AMT_RE.match(line)
    if m:
        amt, unit, rest = m.group(1), (m.group(2) or ""), m.group(3)
    elif line.lower().startswith("splash of "):
        unit, rest = "splash", line[10:]
    elif line.lower().startswith("under 1/4 cup"):
        amt, unit, rest = "1/4", "cup", line[14:] + " (a little less, to taste)"
    unit = {"dashes": "dash", "cups": "cup", "barspoons": "barspoon", "sprigs": "sprig"}.get(unit.lower(), unit.lower() if unit != "Tbsp" else "Tbsp")
    note = ""
    paren = re.search(r"\((.*?)\)", rest)
    if paren: note = paren.group(1); rest = (rest[:paren.start()] + rest[paren.end():]).strip()
    if "," in rest:
        rest, extra = rest.split(",", 1)
        note = (note + "; " if note else "") + extra.strip()
    low = rest.lower()
    bottle = next((v for k, v in BRAND_KEYS.items() if k in line.lower() and v in bottle_names), "")
    if bottle and note and bottle.lower().startswith(note.lower()[:12]): note = ""
    itype = next((t for rx, t in TYPE_KEYS if re.search(rx, low)), rest.strip().capitalize())
    if bottle == "Cointreau": itype = "Orange Liqueur"
    if unit == "" and itype in ("Egg white", "Egg yolk", "Whole egg", "Luxardo cherries", "Lemon wedges"): unit = "whole"
    if itype == "Mint" and not unit: unit = "leaves"
    return [amt, unit, itype, bottle, note]

# ---------- The 8 recipes that were only links, plus fixes ----------
NEW = {
    "Lady Liberty": dict(desc="A white-rum tiki sour with orgeat, a little green Chartreuse and maraschino, and a hint of anise.",
        rows=[["2", "oz", "Light Rum", "", ""], ["1", "oz", "Lime juice", "", ""], ["1", "oz", "Orgeat", "", ""],
              ["1/4", "oz", "Green Chartreuse", "", ""], ["1/4", "oz", "Maraschino Liqueur", "", ""], ["1", "dash", "Absinthe", "", ""]],
        method="Shaken", glass="Rocks", garnish="Lime wheel, mint sprig", base="Rum", color="#e9e3b4", family="Daiquiri",
        instr="Shake everything hard with ice. Strain over crushed ice in a rocks glass and garnish with a lime wheel and mint.",
        note="Spec from a source matching the saved Spruce Eats recipe; the page itself wouldn't load."),
    "Dublin Heights": dict(desc="Irish whiskey and spiced pear with orgeat and lemon, lengthened with soda. A fall highball.",
        rows=[["1 1/2", "oz", "Irish Whiskey", "", ""], ["3/4", "oz", "Orgeat", "", ""], ["3/4", "oz", "Lemon juice", "", ""],
              ["1/2", "oz", "Berry, Stone Fruit & Pear Liqueurs", "", "St. George Spiced Pear"], ["", "top", "Soda water", "", ""]],
        method="Shaken", glass="Highball", garnish="Lemon twist", base="Irish", color="#e3c27a", family="Highball",
        instr="Shake everything except the soda with ice. Strain into an ice-filled highball and top with soda.",
        note="Spec from a copy of the Liber & Co. recipe; garnish not confirmed."),
    "Five and Dime": dict(desc="A cold, tart gin sour rounded out with apricot and almond.",
        rows=[["1 1/2", "oz", "London Dry Gin", "", ""], ["3/4", "oz", "Lemon juice", "", ""], ["1/2", "oz", "Berry, Stone Fruit & Pear Liqueurs", "", "apricot liqueur"],
              ["1/2", "oz", "Orgeat", "", ""], ["2", "dash", "Aromatic Bitters", "Angostura Bitters", ""]],
        method="Shaken", glass="Rocks", garnish="Orange wedge, cherry", base="Gin", color="#e8b56a", family="Daiquiri",
        instr="Shake hard with ice for about 10 seconds. Strain into a rocks glass, pack with crushed ice, and garnish with an orange wedge and a cherry.",
        note="Ingredients from the Liber & Co. page (via search); serve from Kindred Cocktails."),
    "Desert Flower": dict(desc="A floral, spiced sotol sour with honeysuckle and orgeat.",
        rows=[["2", "oz", "Sotol", "", "reposado"], ["3/4", "oz", "Lemon juice", "", ""], ["1/2", "oz", "Orgeat", "", ""],
              ["1/2", "oz", "Honeysuckle Liqueur", "", ""], ["2", "dash", "Tiki Bitters", "", "1 to 2 dashes"]],
        method="Shaken", glass="Rocks", garnish="Lemon wedge", base="Sotol", color="pale", family="Daiquiri",
        instr="Shake hard with ice for about 10 seconds. Strain into a chilled rocks glass and garnish with a lemon wedge.",
        note="From the Liber & Co. page (via search)."),
    "Nightcap": dict(desc="Equal parts brandy, orange curaçao and anisette, made silky with an egg yolk. An after-dinner drink.",
        rows=[["1", "oz", "Cognac", "", ""], ["1", "oz", "Dry Curaçao", "", ""], ["1", "oz", "Anisette", "", ""], ["1", "whole", "Egg yolk", "", ""]],
        method="Shaken", glass="Coupe", garnish="Grated nutmeg", base="Cognac", color="cream", family="Flip",
        instr="Shake everything without ice to emulsify the yolk, then shake again with ice. Strain into a chilled coupe and grate a little nutmeg on top.",
        note="Classic 1930s spec. Couldn't verify Liquor.com's version, which may differ."),
    "White Bat": dict(desc="Rum, Kahlúa and milk topped with cola. A fizzy, creamy cousin of the White Russian.",
        rows=[["1 1/2", "oz", "Light Rum", "", ""], ["1/2", "oz", "Coffee Liqueur", "", ""], ["1 1/2", "oz", "Whole milk", "", ""], ["3", "oz", "Cola", "", ""]],
        method="Built", glass="Highball", garnish="Mint sprig", base="Rum", color="#8a6a4a", family="Highball",
        instr="Build the rum, coffee liqueur and milk over ice in a highball and stir briefly. Top with cola, stir once gently, and serve right away.",
        note="Specs agree across several sources; the Liquor.com page itself wouldn't load."),
    "Tiki Bitters Whiskey Sour": dict(desc="A tropical whiskey sour with pineapple, amaretto and orange, warmed with tiki bitters.",
        rows=[["2", "oz", "Rye Whiskey", "", "or bourbon"], ["1", "oz", "Pineapple juice", "", ""], ["1/2", "oz", "Lemon juice", "", ""],
              ["1/4", "oz", "Amaretto", "", ""], ["1/4", "oz", "Orange Liqueur", "", ""], ["2", "dash", "Tiki Bitters", "", ""]],
        method="Shaken", glass="Rocks", garnish="Cherry and orange slice", base="Rye", color="#e0a84a", family="Daiquiri",
        instr="Shake everything with ice. Strain into a rocks glass over fresh ice and garnish with a cherry and an orange slice.",
        note="From the Emily Fabulous page (via search)."),
    "Cinnamon Cherry 7UP Spritzer": dict(desc="Bourbon, tart cherry and cinnamon, lightened with lemon-lime soda. A holiday highball.",
        rows=[["2", "oz", "Bourbon", "", ""], ["1/2", "oz", "Cinnamon Liqueur", "", ""], ["2", "oz", "Tart cherry juice", "", ""],
              ["4", "oz", "Lemon-lime soda", "", "7UP"], ["2", "whole", "Luxardo cherries", "", "for garnish"], ["1", "Tbsp", "Pomegranate arils", "", "for garnish"]],
        method="Built", glass="Highball", garnish="Cherries, orange slice, cinnamon stick", base="Bourbon", color="ruby", family="Highball",
        instr="Stir the bourbon, cinnamon liqueur and cherry juice in an ice-filled glass. Top with 7UP and add the garnishes. Leave out both spirits for a mocktail.",
        note="From The Forked Spoon page (via search)."),
}

# ---------- Instructions ----------
OVERRIDE_INSTR = {
    "Cold Allen": "Muddle the cherries with a splash of their brine in a shaker. Add the rest with ice and shake hard. Double strain into a chilled coupe and garnish with a cherry.",
    "Old Allen": "Muddle the cherries with a splash of brine in a mixing glass. Add the rest with ice and stir until cold. Strain over a large cube and garnish with a cherry.",
    "White Allen": "Shake everything with ice and strain over fresh ice. Grate nutmeg on top.",
    "Old-Fashioned": "Stir the bourbon, syrup and bitters with ice until well chilled, about 30 seconds. Strain over a large cube, express an orange twist over the top and drop it in.",
    "Martini": "Stir the gin, vermouth and bitters with ice until very cold. Strain into a chilled Nick & Nora and express a lemon twist over the top.",
    "Manhattan": "Stir the rye, vermouth and bitters with ice until very cold. Strain into a chilled coupe and garnish with a Luxardo cherry.",
    "Negroni": "Stir everything with ice and strain over a large cube. Garnish with an orange twist.",
    "Margarita": "Salt half the rim of a rocks glass. Shake everything with ice and strain over fresh ice. Garnish with a lime wheel.",
    "Cable Car": "Rim a coupe with cinnamon sugar. Shake everything with ice and double strain into the glass. Garnish with an orange spiral.",
    "Bourbon Sidecar": "Rim a coupe with sugar. Shake everything with ice and double strain into the glass. Garnish with an orange twist.",
    "Between the Sheets": "Shake everything with ice and double strain into a chilled coupe. Flame an orange twist over the top.",
    "Mai Tai": "Shake everything with crushed ice, pour it all into a rocks glass and top with more crushed ice. Garnish with mint and the spent lime shell.",
    "New York Sour": "Shake the whiskey, lemon and syrup with ice and strain over fresh ice. Slowly pour the wine over the back of a spoon so it floats on top.",
    "Penicillin": "Shake the blended Scotch, lemon and syrup with ice and strain over a large cube. Float the Islay Scotch on top and garnish with candied ginger.",
    "Gin & Tonic": "Fill a highball with ice, add the gin, and top with tonic. Stir once and add a lime wedge.",
    "Whiskey Highball": "Fill a highball with ice, add the whiskey, and top with very cold soda. Stir once gently and add a lemon twist.",
    "Tom Collins": "Shake the gin, lemon and syrup with ice. Strain into an ice-filled Collins glass, top with soda, and garnish with a lemon wheel and cherry.",
    "Mojito": "Gently press the mint with the syrup in a shaker. Add the rum and lime, shake with ice, strain over fresh ice in a highball, and top with a splash of soda. Garnish with mint.",
    "Gin Buck": "Fill a highball with ice, add the gin and lemon, and top with ginger ale. Garnish with a lemon wedge.",
    "Suffering Bastard": "Shake everything except the ginger beer with ice. Strain into an ice-filled Collins glass, top with ginger beer, and garnish with mint and an orange slice.",
    "Spiced Cranberry Bourbon": "Shake the bourbon and spiced cranberry juice with ice, strain over fresh ice, and top with ginger beer. Grate nutmeg on top.",
    "White Russian": "Pour the vodka and coffee liqueur over ice in a rocks glass, then float the cream on top.",
    "Bourbon Milk Punch": "Shake everything hard with ice and strain over fresh ice. Grate nutmeg on top.",
    "French 75": "Shake the gin, lemon and syrup with ice and strain into a flute. Top with sparkling wine and add a lemon twist.",
    "Tequila Sunrise": "Build the tequila and orange juice over ice in a highball, then pour the grenadine down the side so it sinks. Garnish with an orange slice and cherry.",
    "Bourbon Smash": "Muddle the lemon wedges and mint with the syrup in a shaker. Add the bourbon, shake with ice, and strain over crushed ice. Garnish with mint.",
    "Winter Sangria": "Combine everything in a pitcher and chill for a few hours, or warm gently on the stove without boiling. Serve in wine glasses with an orange slice.",
    "Anders' Punch": "Combine everything in a punch bowl over a large block of ice and stir. Ladle into punch cups with a slice of fruit.",
    "Clover Club": "Shake everything without ice to whip the egg white, then shake again with ice. Double strain into a chilled coupe and garnish with raspberries.",
    "Mezcal Sour": "Shake everything without ice to whip the egg white, then shake again with ice. Double strain into a chilled coupe and add a few drops of Angostura on the foam.",
    "Licor 43 Flip": "Shake everything without ice to emulsify the egg, then shake again with ice. Strain into a chilled coupe and grate nutmeg on top.",
    "Whiskey Sour": "If using egg white, shake without ice first. Shake with ice, strain over a large cube, and garnish with a lemon wedge.",
}
def method_of(text):
    t = (text or "").lower()
    if "shake" in t: return "Shaken"
    if "stir" in t: return "Stirred"
    if re.search(r"build|top|pour", t): return "Built"
    if re.search(r"combine|pitcher|bowl", t): return "Batched"
    return ""
def compose(d, method_text):
    g = (d.get("Glass") or "").lower()
    gar = d.get("Garnish") or ""
    t = (method_text or "").lower()
    if "shake" in t:
        s = "Add everything to a shaker with ice and shake hard until very cold, about 12 seconds."
        s += (" Double strain into a chilled " + d["Glass"].lower() + "." if g in ("coupe", "nick & nora", "martini")
              else " Strain over fresh ice." if g == "rocks" else " Strain into the glass over ice.")
    elif "stir" in t:
        s = "Stir everything with ice until well chilled, about 30 seconds." + (" Strain over a large cube." if g == "rocks" else " Strain into a chilled glass.")
    else:
        s = (method_text or "").strip().rstrip(".") + "." if method_text else ""
    if gar and gar.lower() != "none": s += " Garnish with " + gar[0].lower() + gar[1:] + "."
    return s.strip()

# ---------- Assemble cocktails + ingredient rows ----------
C_HEAD = ["Name", "On menu", "House original", "Codex family", "Base spirit", "Description", "Method", "Glass", "Garnish",
          "Instructions", "Photo URL", "Source", "Source URL", "Color", "My rating (1-10)", "Notes (not shown on menu)"]
crow, irows = [], []
for d in cocktails:
    name = d["Name"]
    n = NEW.get(name)
    if n:
        d.update({"Glass": n["glass"], "Garnish": n["garnish"],
                  "Base spirit": n["base"], "Color": n["color"], "Codex family": n["family"]})
        if n.get("note"): d["Notes (not shown on menu)"] = n["note"]
        method, instr, rows = n["method"], n["instr"], n["rows"]
    else:
        old = d.get("Method", "")
        method = method_of(old)
        instr = OVERRIDE_INSTR.get(name) or compose(d, old)
        rows = [r for r in (parse_line(x) for x in (d.get("Ingredients") or "").split("\n")) if r]
    crow.append([name, d.get("On menu", "No"), d.get("House original", "No"), d.get("Codex family", ""), d.get("Base spirit", ""),
                 d.get("Description", ""), method, d.get("Glass", ""), d.get("Garnish", ""), instr, d.get("Photo URL", ""),
                 d.get("Source", ""), d.get("Source URL", ""), d.get("Color", ""), d.get("My rating (1-10)", ""),
                 d.get("Notes (not shown on menu)", "")])
    for r in rows:
        irows.append([name] + r)

all_types = style_names + [t for t in pantry_type_names if t not in style_names]
unknown = sorted({r[3] for r in irows if r[3] not in all_types})
if unknown: print("UNMAPPED ingredient types:", unknown)

# ---------- Workbook ----------
FONT = "Arial"
HDR_FILL = PatternFill("solid", fgColor="2B2420")
HDR_FONT = Font(name=FONT, bold=True, color="F2E8D7", size=10)
BODY = Font(name=FONT, size=10)
WRAP = Alignment(wrap_text=True, vertical="top")
TOP = Alignment(vertical="top")
wb = Workbook(); wb.remove(wb.active)
N = 400

def sheet(title, headers, rows, widths, wrap_cols=(), tab_color=None, hidden=False):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for r in rows: ws.append([None if v == "" else v for v in r])
    for i in range(1, len(headers) + 1):
        c = ws.cell(row=1, column=i); c.fill, c.font = HDR_FILL, HDR_FONT; c.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = widths[i - 1]
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for c in row: c.font = BODY; c.alignment = WRAP if c.column in wrap_cols else TOP
    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "B2"
    if tab_color: ws.sheet_properties.tabColor = tab_color
    if hidden: ws.sheet_state = "hidden"
    return ws

def dv(ws, rng, options=None, formula=None, strict=False):
    v = DataValidation(type="list", formula1=formula or '"' + ",".join(options) + '"', allow_blank=True)
    v.showErrorMessage = strict; v.error = "Pick from the list"
    ws.add_data_validation(v); v.add(rng)
    return v

def fill_rule(ws, rng, formula, bg, fg, bold=True):
    ws.conditional_formatting.add(rng, FormulaRule(formula=[formula], fill=PatternFill("solid", fgColor=bg, bgColor=bg), font=Font(color=fg, bold=bold)))

def status_colors(ws, col, rng):
    for val, bg, fg in [("In stock", "D9EAD3", "274E13"), ("Low", "FCE5CD", "7F4A00"), ("Out", "F4CCCC", "990000"),
                        ("Wishlist", "CFE2F3", "1C4587"), ("Tried", "EFEFEF", "666666")]:
        fill_rule(ws, rng, '$%s2="%s"' % (col, val), bg, fg)

def rating_scale(ws, rng):
    ws.conditional_formatting.add(rng, ColorScaleRule(start_type="num", start_value=1, start_color="EA9999",
        mid_type="num", mid_value=6, mid_color="FFF2CC", end_type="num", end_value=10, end_color="57BB8A"))

def num(v):
    try: return float(v) if "." in v else int(v)
    except (ValueError, TypeError): return v

# Cocktails
for r in crow: r[14] = num(r[14]) if r[14] else ""
ws = sheet("Cocktails", C_HEAD, crow, [26, 10, 10, 14, 12, 40, 11, 13, 22, 48, 24, 18, 30, 10, 11, 40], wrap_cols={6, 10, 16}, tab_color="C9A25B")
dv(ws, f"B2:B{N}", ["Yes", "No"], strict=True)
dv(ws, f"C2:C{N}", ["Yes", "No"], strict=True)
dv(ws, f"D2:D{N}", ["Old-Fashioned", "Martini", "Daiquiri", "Sidecar", "Highball", "Flip"])
dv(ws, f"E2:E{N}", ["Bourbon", "Rye", "Scotch", "Irish", "Gin", "Rum", "Tequila", "Mezcal", "Sotol", "Cognac", "Brandy", "Vodka", "Amaretto", "Wine", "Other"])
dv(ws, f"G2:G{N}", ["Shaken", "Stirred", "Built", "Blended", "Batched"])
dv(ws, f"H2:H{N}", ["Coupe", "Nick & Nora", "Martini", "Rocks", "Highball", "Collins", "Flute", "Wine glass", "Mug", "Punch cup"])
dv(ws, f"I2:I{N}", formula="Lists!$A$2:$A$100")
dv(ws, f"L2:L{N}", ["House original", "Cocktail Codex", "Classic", "Liquor.com", "Liber & Co.", "Kitchen Swagger", "The Spruce Eats"])
dv(ws, f"N2:N{N}", ["amber", "gold", "clear", "pale", "cream", "orange", "pink", "red", "ruby", "cherry", "green", "lime", "lemon", "brown", "coffee"])
fill_rule(ws, f"B2:C{N}", 'B2="Yes"', "D9EAD3", "274E13")
ws.conditional_formatting.add(f"A2:A{N}", FormulaRule(formula=['$B2="Yes"'], font=Font(bold=True)))
rating_scale(ws, f"O2:O{N}")

# Recipe Ingredients: one row per ingredient
I_HEAD = ["Drink", "Amount", "Unit", "Ingredient", "Bottle (pick one)", "Note"]
IN = max(900, len(irows) + 400)
ws = sheet("Recipe Ingredients", I_HEAD, irows, [28, 9, 10, 30, 34, 36], wrap_cols={6}, tab_color="C9A25B")
for r in range(2, IN + 1): ws.cell(row=r, column=2).number_format = "@"
for r, row in enumerate(irows, start=2): ws.cell(row=r, column=2).value = row[1] or None
dv(ws, f"A2:A{IN}", formula="Cocktails!$A$2:$A$400")
dv(ws, f"B2:B{IN}", ["1/4", "1/3", "1/2", "2/3", "3/4", "1", "1 1/4", "1 1/2", "1 3/4", "2", "2 1/2", "3", "4", "6", "8", "10"])
dv(ws, f"C2:C{IN}", ["oz", "dash", "barspoon", "tsp", "Tbsp", "cup", "whole", "leaves", "splash", "top", "rinse", "drops", "bottle", "slice", "wedge"])
dv(ws, f"D2:D{IN}", formula="Lists!$C$2:$C$300")
# Dependent dropdown: each row's Bottle list comes from the matching row of the hidden "Bottle Choices" tab.
for r in range(2, IN + 1):
    v = DataValidation(type="list", formula1=f"'Bottle Choices'!$A${r}:$AD${r}", allow_blank=True)
    v.showErrorMessage = False
    ws.add_data_validation(v); v.add(f"E{r}")
ws.conditional_formatting.add(f"A2:F{IN}", FormulaRule(formula=['AND($A2<>"",$A2<>$A1)'], fill=PatternFill("solid", fgColor="F3EDE2", bgColor="F3EDE2")))
ws.conditional_formatting.add(f"A2:A{IN}", FormulaRule(formula=['$A2=$A1'], font=Font(color="9C9488")))

ch = wb.create_sheet("Bottle Choices")
ch.sheet_state = "hidden"
ch.append(["Bottles that match each Recipe Ingredients row's Ingredient (helper for the Bottle dropdown; don't edit)"])
for r in range(2, IN + 1):
    ch.cell(row=r, column=1).value = (f"=IFERROR(TRANSPOSE(FILTER(Bottles!$A$2:$A$500,Bottles!$C$2:$C$500='Recipe Ingredients'!$D{r})),\"\")")

# Bottles (the owner's own columns, kept as-is)
brow = [[num(b.get(h, "")) if h.startswith("Rating") and b.get(h) else b.get(h, "") for h in b_head] for b in bottles]
ws = sheet("Bottles", b_head, brow, [36, 18, 22, 11, 40, 11, 46, 10, 12][:len(b_head)] + [16] * max(0, len(b_head) - 9), wrap_cols={5, 7}, tab_color="7FB069")
col = {h: get_column_letter(i + 1) for i, h in enumerate(b_head)}
fams = ["Whiskey", "Gin", "Rum", "Agave", "Brandy", "Vodka", "Liqueur", "Amaro & Aperitivo", "Vermouth & Fortified", "Bitters", "Other"]
dv(ws, f"{col['Family']}2:{col['Family']}{N}", fams)
dv(ws, f"{col['Style']}2:{col['Style']}{N}", formula="Styles!$A$2:$A$300")
dv(ws, f"{col['Status']}2:{col['Status']}{N}", ["In stock", "Low", "Out", "Wishlist", "Tried"], strict=True)
if "Priority" in col: dv(ws, f"{col['Priority']}2:{col['Priority']}{N}", ["High", "Medium", "Low"])
if "Show on menu" in col: dv(ws, f"{col['Show on menu']}2:{col['Show on menu']}{N}", ["Yes", "No"])
rc = col.get("Rating (1-10)")
if rc:
    v = DataValidation(type="decimal", operator="between", formula1="0", formula2="10", allow_blank=True); v.showErrorMessage = True
    ws.add_data_validation(v); v.add(f"{rc}2:{rc}{N}"); rating_scale(ws, f"{rc}2:{rc}{N}")
status_colors(ws, col["Status"], f"{col['Status']}2:{col['Status']}{N}")

# Pantry
prow = [[p.get(h, "") for h in p_head] for p in pantry]
ws = sheet("Pantry", p_head, prow, [24, 12, 11, 12, 70], wrap_cols={5}, tab_color="A3967F")
dv(ws, f"B2:B{N}", ["Syrup", "Citrus", "Mixer", "Garnish", "Dairy", "Wine", "Other"])
dv(ws, f"C2:C{N}", ["In stock", "Low", "Out"], strict=True)
dv(ws, f"D2:D{N}", ["Yes", "No"])
status_colors(ws, "C", f"C2:C{N}")

# Lists: garnishes, ingredient types (with what stocks each), for dropdowns
GARNISHES = ["Luxardo cherry", "Orange twist", "Lemon twist", "Lime wheel", "Lime wedge", "Lemon wheel", "Lemon wedge", "Orange slice",
             "Orange wedge", "Mint sprig", "Grated nutmeg", "Salt rim", "Half salt rim", "Sugar rim", "Cinnamon-sugar rim", "Flamed orange twist",
             "Candied ginger", "Raspberries", "Blackberry", "Angostura drops", "Cinnamon stick", "None"]
type_rows = [(s, "Bottle", "") for s in style_names] + [(t, "Pantry", item) for t, item in PANTRY_TYPES if t not in style_names]
L = max(len(GARNISHES), len(type_rows))
lrows = [[GARNISHES[i] if i < len(GARNISHES) else "", "",
          type_rows[i][0] if i < len(type_rows) else "", type_rows[i][1] if i < len(type_rows) else "",
          type_rows[i][2] if i < len(type_rows) else ""] for i in range(L)]
ws = sheet("Lists", ["Garnishes", "", "Ingredient", "Kind", "Stocked as (Pantry item)"], lrows, [24, 3, 34, 10, 26], tab_color="6B5634")

# Shelf intros, styles, picks, settings
ws = sheet("Shelf Intros", ["Family", "Intro"], [[r["Family"], r["Intro"]] for r in intros], [22, 110], wrap_cols={2}, tab_color="6B5634")
ws = sheet("Styles", ["Style", "Family", "Profile", "Codex picks", "Source"], [[s.get(k, "") for k in ["Style", "Family", "Profile", "Codex picks", "Source"]] for s in styles],
           [30, 18, 90, 44, 14], wrap_cols={3, 4}, tab_color="6B5634")
prows = []
for i, p in enumerate(picks, start=2):
    f = (f'=IF(COUNTIFS(Bottles!$A:$A,"*"&D{i}&"*",Bottles!${col["Status"]}:${col["Status"]},"In stock")'
         f'+COUNTIFS(Bottles!$A:$A,"*"&D{i}&"*",Bottles!${col["Status"]}:${col["Status"]},"Low")>0,"Yes","No")')
    prows.append([p["Bottle"], p["Style"], p["Why"][:1].upper() + p["Why"][1:], p["Match"], f])
ws = sheet("Codex Picks", ["Bottle", "Style", "Why", "Match", "On your shelf"], prows, [36, 26, 70, 26, 13], wrap_cols={3}, tab_color="6B5634")
fill_rule(ws, f"E2:E{N}", '$E2="Yes"', "D9EAD3", "274E13")
srows = [[s["Setting"], s["Value"]] for s in settings]
ws = sheet("Settings", ["Setting", "Value"], srows, [28, 100], wrap_cols={2})
dv(ws, "B2:B400", None, formula=None) if False else None

README = [
    ("How this works", "This sheet is the back end for the Middle Shelf menu. The guest menu and the Back Bar page read it each time they load, so edits show up on the next refresh."),
    ("Cocktails", "One row per drink. On menu = Yes shows it to guests. Guests can group drinks by Codex family or by base spirit, so fill in both. House original = Yes also puts it in the House Originals page. Method, Glass, Garnish, Base spirit, Codex family, Source and Color all have dropdowns; you can still type something else."),
    ("Recipe Ingredients", "One row per ingredient. Pick the Drink, Amount, Unit and Ingredient from the dropdowns. Then the Bottle dropdown lists only the bottles in your Bottles tab of that type (pick Bourbon and you'll see your bourbons). Leave Bottle blank to mean 'any'. Add new ingredients at the bottom of the list; the dropdowns are set up for about 900 rows."),
    ("How the menu shows ingredients", "If a Bottle is picked, guests see the bottle name (3/4 oz Elijah Craig Small Batch). Otherwise they see the Ingredient (3/4 oz Bourbon). Note shows after it in the drink's detail view."),
    ("Menu check", "The Back Bar page checks each menu drink's ingredients: a picked bottle must be In stock or Low; otherwise any bottle of that Ingredient type counts. Pantry ingredients use the 'Stocked as' column on the Lists tab."),
    ("Photos", "Paste a link in Photo URL. A Google Drive share link works if the file is shared as 'Anyone with the link'. Leave it blank to show a drawn glass in the drink's Color."),
    ("Bottles", "Status: In stock and Low show on the guest Shelf pages (Low shows as 'Last pours'). Out, Wishlist and Tried stay private. Guest note is the short flavor line guests see; Rating and Tasting notes stay private. Show on menu = No hides an open bottle."),
    ("Ratings", "1 to 10, colored red to green. Never shown on the guest menu, but anyone with this sheet's link could read them."),
    ("Lists", "Garnish choices and the Ingredient list used by the dropdowns. Add new ones at the bottom of a column."),
    ("Don't", "Don't rename tabs or column headers. The website looks them up by name. The hidden Bottle Choices tab powers the Bottle dropdown; leave it alone."),
]
sheet("Read Me", ["Topic", "Notes"], README, [22, 110], wrap_cols={2})
wb.move_sheet("Bottle Choices", offset=len(wb.sheetnames))
wb.save(OUT)

# ---------- Snapshot (guest-safe) as JS so the menu works when opened as a file ----------
def key(h):
    h = re.sub(r"\(.*?\)", "", h).lower()
    return re.sub(r"[^a-z0-9]+", "_", h).strip("_")
on = {r[0] for r in crow if r[1] == "Yes"}
snap = {
    "Cocktails": [{key(h): str(v) for h, v in zip(C_HEAD, r) if key(h) not in ("my_rating", "notes")} for r in crow if r[1] == "Yes"],
    "Recipe Ingredients": [{key(h): str(v) for h, v in zip(I_HEAD, r)} for r in irows if r[0] in on],
    "Bottles": [{key(h): str(b.get(h, "")) for h in b_head if key(h) in ("bottle", "family", "style", "status", "guest_note", "show_on_menu")}
                for b in bottles if b.get("Status") in ("In stock", "Low") and b.get("Show on menu") != "No"],
    "Shelf Intros": [{"family": r["Family"], "intro": r["Intro"]} for r in intros],
    "Settings": [{"setting": s["Setting"], "value": s["Value"]} for s in settings],
}
with open(SNAP, "w", encoding="utf-8") as f:
    f.write("// Saved copy of the menu, used when the live sheet can't be reached.\nwindow.MS_SNAPSHOT = " + json.dumps(snap, ensure_ascii=False) + ";\n")
print("ok cocktails", len(crow), "ingredient rows", len(irows), "bottles", len(brow), "pantry", len(prow), "styles", len(styles))
