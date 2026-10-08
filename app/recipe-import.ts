// Parses a recipe written as plain text, in this format:
//
//   Spaghetti Carbonara
//   4                   (or "Serves 4", "4 Personen", "4 Portionen", "für 4", "für 4 Personen")
//   https://example.com/carbonara   (optional weblink, starting with http(s):// or www.)
//   ---                 (or "Ingredients")
//   400 g spaghetti
//   2 eggs              (a number without a unit means pieces)
//   salt                (no quantity)
//   1 garlic clove - finely chopped   (a note after " - ", "," or in parentheses)
//   "Salz, Pfeffer"     (quotes keep commas, dashes and parentheses in the name)
//
//   ---                 (or "Instructions")
//   Free markdown…
//   ---                 (or "Comments")
//   Free text…
//
// It's deliberately strict: anything it doesn't understand is an error on that
// line, to be fixed in the text, rather than a guess.

import { webUrl } from "./forms";
import { UNITS, type UnitKey } from "./units";

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

// Each unit's key, German label and plural, plus English and spelled-out names.
// Matched lowercase and without a trailing dot ("Stk." → "stk").
const UNIT_ALIASES = new Map<string, UnitKey>();
for (const u of UNITS) {
  for (const alias of [u.key, u.label, u.plural]) UNIT_ALIASES.set(alias.toLowerCase().replace(/\.$/, ""), u.key);
}
for (const [alias, key] of Object.entries({
  pc: "pcs", pinch: "pinch", pinches: "pinch", can: "can", cans: "can", jar: "jar", jars: "jar",
  pack: "pack", packs: "pack", bottle: "bottle", bottles: "bottle", crate: "crate", crates: "crate",
  bunch: "bunch", bunches: "bunch",
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

// Case and spacing don't matter when matching ingredient names to items
export function itemKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

// An item matches by its name and, if it has one, its plural
export function itemKeys(item: { name: string; plural: string | null }) {
  return item.plural ? [itemKey(item.name), itemKey(item.plural)] : [itemKey(item.name)];
}

// Common German and English plural endings
const PLURAL_ENDINGS = ["n", "en", "e", "er", "s", "es"];

// The item without a plural yet that a name is probably the plural of ("Knoblauchzehen" → Knoblauchzehe).
// Only good for a suggestion: German plurals are too irregular to match on this alone ("Mais" → "Mai").
export function likelySingular<T extends { name: string; plural: string | null }>(name: string, items: T[]): T | undefined {
  const key = itemKey(name);
  return items.find((i) => !i.plural && PLURAL_ENDINGS.some((ending) => itemKey(i.name) + ending === key));
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
  if (QUOTE_CHAR.test(name)) return { error: "Put the quotes around the whole name." };
  return name;
}

export function parseIngredient(text: string): Omit<ParsedIngredient, "line"> | { error: string } {
  const rest = text.replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim();
  if (QUOTE_CHAR.test(rest.replace(QUOTED, ""))) return { error: "Missing the closing quote." };
  const match = QUANTITY.exec(rest);
  if (!match) {
    const { name: quotedName, note } = splitNote(rest);
    const name = unquote(quotedName);
    if (typeof name !== "string") return name;
    if (!name) return { error: "Missing the ingredient name before the note." };
    return { name, quantity: null, unit: null, note };
  }

  const quantity = parseQuantity(match[1]);
  if (!(quantity > 0)) return { error: "Quantity must be more than 0." };

  const afterQuantity = rest.slice(match[0].length).trim();
  if (/^[-–]\s*\d/.test(afterQuantity)) return { error: "Ranges aren't supported; pick one quantity." };
  const { name: unitAndName, note } = splitNote(afterQuantity);
  const [word, ...nameWords] = unitAndName.split(" ");
  const unit = UNIT_ALIASES.get(word.toLowerCase().replace(/\.$/, ""));
  const name = unquote(unit ? nameWords.join(" ") : unitAndName);
  if (typeof name !== "string") return name;
  if (!name) return { error: "Missing the ingredient name after the quantity." };
  return { name, quantity, unit: unit ?? "pcs", note };
}

// The servings: "4", "Serves 4", "4 Personen", "4 Portionen", "für 4", "für 4 Personen"
const SERVES = /^(?:(?:serves|für)\s+(\S+)(?:\s+(?:person|portion)(?:en)?)?|(\S+)\s+(?:person|portion)(?:en)?|(\d\S*))$/i;

function sectionOf(line: string): Section | null {
  const word = line.trim().replace(/^#+\s*/, "").replace(/:$/, "").trim().toLowerCase();
  return (SECTIONS as readonly string[]).includes(word) ? (word as Section) : null;
}

export function parseRecipeText(text: string): { recipe: ParsedRecipe; errors: ImportError[] } {
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
        errors.push({ line, message: "There's no section after the comments." });
        return;
      }
      if (seen.has(after)) errors.push({ line, message: `"${after[0].toUpperCase() + after.slice(1)}" appears twice.` });
      seen.add(after);
      section = after;
      return;
    }

    const next = sectionOf(raw);
    if (next) {
      if (seen.has(next)) errors.push({ line, message: `"${trimmed}" appears twice.` });
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
          if (weblinkLine != null) errors.push({ line, message: `There's already a weblink in line ${weblinkLine}.` });
          else if (!url) errors.push({ line, message: "The weblink isn't a valid web address." });
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
          else errors.push({ line, message: "Servings must be a whole number of at least 1." });
          return;
        }
        errors.push({ line, message: 'Expected the servings ("4"), a weblink or "---" before the ingredients.' });
        return;
      }

      case "ingredients": {
        if (!trimmed) return;
        const parsed = parseIngredient(trimmed);
        if ("error" in parsed) {
          errors.push({ line, message: parsed.error });
          return;
        }
        const duplicate = recipe.ingredients.find((ing) => itemKey(ing.name) === itemKey(parsed.name));
        if (duplicate) {
          errors.push({ line, message: `"${parsed.name}" is already listed in line ${duplicate.line}; combine them into one line.` });
          return;
        }
        recipe.ingredients.push({ line, ...parsed });
        return;
      }

      default:
        freeText[section].push(raw);
    }
  });

  recipe.instructions = freeText.instructions.join("\n").trim() || null;
  recipe.comments = freeText.comments.join("\n").trim() || null;

  if (!recipe.name) errors.push({ line: null, message: "The first line must be the recipe name." });
  else if (servesLine == null) errors.push({ line: null, message: 'Add the servings ("4") below the name.' });
  if (!seen.has("ingredients")) errors.push({ line: null, message: 'Add "---" (or "Ingredients") before the ingredients.' });
  else if (recipe.ingredients.length === 0) errors.push({ line: null, message: "List at least one ingredient." });

  errors.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
  return { recipe, errors };
}
