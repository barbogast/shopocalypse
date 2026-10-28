// Parses a recipe written as plain text, in this format:
//
//   Spaghetti Carbonara
//   4                   (or "4 Personen", "4 Portionen", "für 4", "für 4 Personen", "Serves 4")
//   https://example.com/carbonara   (optional weblink, starting with http(s):// or www.)
//   ---                 (or "Zutaten", "Ingredients")
//   400 g spaghetti
//   2 eggs              (a number without a unit means pieces)
//   salt                (no quantity)
//   1 garlic clove - finely chopped   (a note after " - ", "," or in parentheses)
//   "Salz, Pfeffer"     (quotes keep commas, dashes and parentheses in the name)
//
//   ---                 (or "Zubereitung", "Instructions")
//   Free markdown…
//   ---                 (or "Anmerkungen", "Comments")
//   Free text…
//
// It's deliberately strict: anything it doesn't understand is an error on that
// line, to be fixed in the text, rather than a guess.

// With extensions, so scripts/ can load this file with plain Node (for backfilling recipe versions)
import { webUrl } from "./forms.ts";
import { itemKey, itemKeyIn } from "./item-names.ts";
import { nameForAmounts, UNITS, type UnitKey } from "./units.ts";

export type ParsedIngredient = {
  line: number;
  name: string;
  quantity: number | null;
  unit: UnitKey | null;
  note: string | null;
};

export type ParsedRecipe = {
  name: string;
  servingSize: number | null;
  weblink: string | null;
  ingredients: ParsedIngredient[];
  instructions: string | null;
  comments: string | null;
};

// `line` is 1-based; null for problems with the text as a whole
export type ImportError = { line: number | null; message: string };

const SECTIONS = ["ingredients", "instructions", "comments"] as const;
type Section = (typeof SECTIONS)[number];

// Each section's heading, as written out and in messages; the English ones still read back
const SECTION_HEADINGS: Record<Section, string> = { ingredients: "Zutaten", instructions: "Zubereitung", comments: "Anmerkungen" };
const SECTION_WORDS = new Map<string, Section>(
  SECTIONS.flatMap((s) => [[s, s], [SECTION_HEADINGS[s].toLowerCase(), s]] as const),
);

// Each unit's key, German label and plural, plus English and spelled-out names.
// Matched lowercase and without a trailing dot ("Stk." → "stk").
const UNIT_ALIASES = new Map<string, UnitKey>();
for (const u of UNITS) {
  for (const alias of [u.key, u.label, u.plural]) UNIT_ALIASES.set(alias.toLowerCase().replace(/\.$/, ""), u.key);
}
for (const [alias, key] of Object.entries({
  pc: "pcs", pinch: "pinch", pinches: "pinch", can: "can", cans: "can", jar: "jar", jars: "jar",
  pack: "pack", packs: "pack", bottle: "bottle", bottles: "bottle", crate: "crate", crates: "crate",
  bunch: "bunch", bunches: "bunch", messerspitze: "knifetip", messerspitzen: "knifetip",
  handful: "handful", handfuls: "handful",
  gram: "g", grams: "g",
  kilogram: "kg", kilograms: "kg",
  millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  litre: "l", litres: "l", liter: "l", liters: "l",
  piece: "pcs", pieces: "pcs",
  teaspoon: "tsp", teaspoons: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp",
  gramm: "g", kilogramm: "kg", stück: "pcs", teelöffel: "tsp", esslöffel: "tbsp",
  pck: "pack", pkg: "pack", päckchen: "pack", kiste: "crate", kisten: "crate",
} satisfies Record<string, UnitKey>)) UNIT_ALIASES.set(alias, key);

const FRACTIONS: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4 };

// A leading quantity: "2", "1.5", "1,5", "1/2", "1 1/2", "½", "1½"
const QUANTITY = /^(\d*\s?[½⅓⅔¼¾]|\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)(?=\s|$|[^\d.,/½⅓⅔¼¾])/;

function parseQuantity(raw: string): number {
  return raw.trim().split(/\s+|(?=[½⅓⅔¼¾])/).reduce((sum, part) => {
    if (part in FRACTIONS) return sum + FRACTIONS[part];
    const [num, den] = part.split("/");
    return sum + (den ? Number(num) / Number(den) : Number(num.replace(",", ".")));
  }, 0);
}

// A quoted name: "…", “…”, „…“ or „…”
const QUOTED = /["“„][^"“”„]*["“”]/g;
const QUOTE_CHAR = /["“”„]/;

// Splits a note off an ingredient name: "garlic - finely chopped", "onion, diced",
// "feta (or halloumi)". A dash only counts with spaces around it ("chili-flakes"),
// and a comma inside parentheses or quotes doesn't start a note.
function splitNote(text: string): { name: string; note: string | null } {
  const masked = text
    .replace(QUOTED, (m) => m[0] + " ".repeat(m.length - 2) + m[m.length - 1])
    .replace(/\([^)]*\)/g, (m) => "(" + " ".repeat(m.length - 2) + ")");
  const sep = /\s[-–](?:\s|$)|,/.exec(masked);
  const end = sep ? sep.index : text.length;
  const notes: string[] = [];
  // Parentheses in the name become notes; found in the masked text so ones inside quotes stay
  let name = text.slice(0, end);
  for (const m of masked.slice(0, end).matchAll(/\( *\)/g)) {
    notes.push(name.slice(m.index + 1, m.index + m[0].length - 1).trim());
    name = name.slice(0, m.index) + " ".repeat(m[0].length) + name.slice(m.index + m[0].length);
  }
  if (sep) notes.push(text.slice(sep.index + sep[0].length).trim());
  return { name: name.replace(/\s+/g, " ").trim(), note: notes.filter(Boolean).join("; ") || null };
}

// Strips the quotes around a name: "Salz, Pfeffer" → Salz, Pfeffer
function unquote(name: string): string | { error: string } {
  const quoted = /^["“„]([^"“”„]*)["“”]$/.exec(name);
  if (quoted) return quoted[1].trim();
  if (QUOTE_CHAR.test(name)) return { error: "Die Anführungszeichen gehören um den ganzen Namen." };
  return name;
}

export function parseIngredient(text: string): Omit<ParsedIngredient, "line"> | { error: string } {
  const rest = text.replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim();
  if (QUOTE_CHAR.test(rest.replace(QUOTED, ""))) return { error: "Das schließende Anführungszeichen fehlt." };
  const match = QUANTITY.exec(rest);
  if (!match) {
    const { name: quotedName, note } = splitNote(rest);
    const name = unquote(quotedName);
    if (typeof name !== "string") return name;
    if (!name) return { error: "Vor der Anmerkung fehlt der Name der Zutat." };
    return { name, quantity: null, unit: null, note };
  }

  const quantity = parseQuantity(match[1]);
  if (!(quantity > 0)) return { error: "Die Menge muss größer als 0 sein." };

  const afterQuantity = rest.slice(match[0].length).trim();
  if (/^[-–]\s*\d/.test(afterQuantity)) return { error: "Bereiche gehen nicht; bitte eine Menge wählen." };
  const { name: unitAndName, note } = splitNote(afterQuantity);
  const [word, ...nameWords] = unitAndName.split(" ");
  const unit = UNIT_ALIASES.get(word.toLowerCase().replace(/\.$/, ""));
  const name = unquote(unit ? nameWords.join(" ") : unitAndName);
  if (typeof name !== "string") return name;
  if (!name) return { error: "Nach der Menge fehlt der Name der Zutat." };
  return { name, quantity, unit: unit ?? "pcs", note };
}

// Parses one ingredient line onto the list, or notes why it can't; blank lines are skipped.
// Two lines for the same item are an error, also when one uses its name and the other its plural.
function addIngredientLine(
  ingredients: ParsedIngredient[], errors: ImportError[], line: number, trimmed: string, keyOf: (name: string) => string,
) {
  if (!trimmed) return;
  const parsed = parseIngredient(trimmed);
  if ("error" in parsed) {
    errors.push({ line, message: parsed.error });
    return;
  }
  const duplicate = ingredients.find((ing) => keyOf(ing.name) === keyOf(parsed.name));
  if (duplicate) {
    const message = itemKey(duplicate.name) === itemKey(parsed.name)
      ? `„${parsed.name}“ steht schon in Zeile ${duplicate.line}; bitte zu einer Zeile zusammenfassen.`
      : `„${parsed.name}“ ist derselbe Artikel wie „${duplicate.name}“ in Zeile ${duplicate.line}; bitte zu einer Zeile zusammenfassen.`;
    errors.push({ line, message });
    return;
  }
  ingredients.push({ line, ...parsed });
}

// Items for a shopping list, one per line, written like a recipe's ingredients.
// `items` are the existing ones, to catch two lines for the same item.
export function parseItemsText(
  text: string, items: { name: string; plural: string | null }[] = [],
): { items: ParsedIngredient[]; errors: ImportError[] } {
  const parsed: ParsedIngredient[] = [];
  const errors: ImportError[] = [];
  const keyOf = itemKeyIn(items);
  text.split(/\r?\n/).forEach((raw, i) => addIngredientLine(parsed, errors, i + 1, raw.trim(), keyOf));
  return { items: parsed, errors };
}

// The servings: "4", "4 Personen", "4 Portionen", "für 4", "für 4 Personen", "Serves 4"
const SERVES = /^(?:(?:serves|für)\s+(\S+)(?:\s+(?:person|portion)(?:en)?)?|(\S+)\s+(?:person|portion)(?:en)?|(\d\S*))$/i;

function sectionOf(line: string): Section | null {
  const word = line.trim().replace(/^#+\s*/, "").replace(/:$/, "").trim().toLowerCase();
  return SECTION_WORDS.get(word) ?? null;
}

// `items` are the existing ones, to catch two ingredient lines for the same item
export function parseRecipeText(
  text: string, items: { name: string; plural: string | null }[] = [],
): { recipe: ParsedRecipe; errors: ImportError[] } {
  const keyOf = itemKeyIn(items);
  const lines = text.split(/\r?\n/);
  const errors: ImportError[] = [];
  const recipe: ParsedRecipe = { name: "", servingSize: null, weblink: null, ingredients: [], instructions: null, comments: null };
  const seen = new Set<Section>();
  const freeText: Record<"instructions" | "comments", string[]> = { instructions: [], comments: [] };
  let section: Section | "header" = "header";
  let servesLine: number | null = null;
  let weblinkLine: number | null = null;

  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();

    // "---" moves on to the section after the current one
    if (/^-{3,}$/.test(trimmed)) {
      const after = section === "header" ? SECTIONS[0] : SECTIONS[SECTIONS.indexOf(section) + 1];
      if (!after) {
        errors.push({ line, message: "Nach den Anmerkungen kommt kein weiterer Abschnitt." });
        return;
      }
      if (seen.has(after)) errors.push({ line, message: `„${SECTION_HEADINGS[after]}“ kommt doppelt vor.` });
      seen.add(after);
      section = after;
      return;
    }

    const next = sectionOf(raw);
    if (next) {
      if (seen.has(next)) errors.push({ line, message: `„${trimmed}“ kommt doppelt vor.` });
      seen.add(next);
      section = next;
      return;
    }

    switch (section) {
      case "header": {
        if (!trimmed) return;
        if (!recipe.name) {
          recipe.name = trimmed.replace(/^#+\s*/, "");
          return;
        }
        if (/^(https?:\/\/|www\.)/i.test(trimmed)) {
          const url = webUrl(trimmed);
          if (weblinkLine != null) errors.push({ line, message: `In Zeile ${weblinkLine} steht schon ein Weblink.` });
          else if (!url) errors.push({ line, message: "Der Weblink ist keine gültige Webadresse." });
          else {
            weblinkLine = line;
            recipe.weblink = url;
          }
          return;
        }
        const serves = SERVES.exec(trimmed);
        if (serves && servesLine == null) {
          servesLine = line;
          const n = Number(serves[1] ?? serves[2] ?? serves[3]);
          if (Number.isInteger(n) && n >= 1) recipe.servingSize = n;
          else errors.push({ line, message: "Die Portionen müssen eine ganze Zahl ab 1 sein." });
          return;
        }
        errors.push({ line, message: "Erwartet: die Portionen („4“), ein Weblink oder „---“ vor den Zutaten." });
        return;
      }

      case "ingredients":
        addIngredientLine(recipe.ingredients, errors, line, trimmed, keyOf);
        return;

      default:
        freeText[section].push(raw);
    }
  });

  recipe.instructions = freeText.instructions.join("\n").trim() || null;
  recipe.comments = freeText.comments.join("\n").trim() || null;

  if (!recipe.name) errors.push({ line: null, message: "Die erste Zeile muss der Name des Rezepts sein." });
  else if (servesLine == null) errors.push({ line: null, message: "Unter dem Namen fehlen die Portionen („4“)." });
  if (!seen.has("ingredients")) errors.push({ line: null, message: "Vor den Zutaten fehlt „---“ (oder „Zutaten“)." });
  else if (recipe.ingredients.length === 0) errors.push({ line: null, message: "Mindestens eine Zutat angeben." });

  errors.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
  return { recipe, errors };
}

// A recipe written out in the format above, to keep its versions. Reads back with parseRecipeText,
// unless the instructions have a line that looks like a heading ("Anmerkungen", "---")
export type RecipeForText = {
  name: string;
  servingSize: number;
  weblink: string | null;
  instructions: string | null;
  comments: string | null;
  ingredients: IngredientForText[];
};

type IngredientForText = { name: string; plural?: string | null; quantity: number | null; unit: UnitKey | null; note: string | null };

// Without grouping: "1.000 g" would read back as 1 g
const quantityFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3, useGrouping: false });

export function ingredientToText(ing: IngredientForText): string {
  const { quantity, note } = ing;
  const unit = quantity == null ? null : ing.unit ?? "pcs";
  const name = nameForAmounts(ing, [{ quantity, unit }]);
  const def = UNITS.find((u) => u.key === unit);
  // A number alone means pieces
  const amount = quantity == null ? "" : `${quantityFormat.format(quantity)} ${def && unit !== "pcs" ? `${quantity === 1 ? def.label : def.plural} ` : ""}`;
  const line = (n: string) => `${amount}${n}${note ? ` - ${note}` : ""}`;

  // Quote the name when it would read back differently: "Salz, Pfeffer", or "Dose Tomaten" after a number
  const parsed = parseIngredient(line(name));
  const readsBack = !("error" in parsed) && parsed.name === name && parsed.unit === unit
    && (parsed.note ?? null) === (note || null);
  return readsBack ? line(name) : line(`"${name}"`);
}

export function recipeToText(recipe: RecipeForText): string {
  const sections = [
    [recipe.name, String(recipe.servingSize), recipe.weblink].filter(Boolean).join("\n"),
    [SECTION_HEADINGS.ingredients, ...recipe.ingredients.map(ingredientToText)].join("\n"),
  ];
  if (recipe.instructions) sections.push(`${SECTION_HEADINGS.instructions}\n${recipe.instructions}`);
  if (recipe.comments) sections.push(`${SECTION_HEADINGS.comments}\n${recipe.comments}`);
  // Textareas submit \r\n
  return sections.join("\n\n").replace(/\r\n/g, "\n");
}
