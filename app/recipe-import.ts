// Parses a recipe written as plain text, in this format:
//
//   Spaghetti Carbonara
//   Serves 4
//
//   Ingredients
//   400 g spaghetti
//   2 eggs              (a number without a unit means pieces)
//   salt                (no quantity)
//
//   Instructions
//   Free markdown…
//
//   Comments
//   Free text…
//
// It's deliberately strict: anything it doesn't understand is an error on that
// line, to be fixed in the text, rather than a guess.

import { UNITS, type UnitKey } from "./units";

export type ParsedIngredient = { line: number; name: string; quantity: number | null; unit: UnitKey | null };

export type ParsedRecipe = {
  name: string;
  servingSize: number | null;
  ingredients: ParsedIngredient[];
  instructions: string | null;
  comments: string | null;
};

// `line` is 1-based; null for problems with the text as a whole
export type ImportError = { line: number | null; message: string };

const SECTIONS = ["ingredients", "instructions", "comments"] as const;
type Section = (typeof SECTIONS)[number];

// Each unit's key, label and plural, plus spelled-out names
const UNIT_ALIASES = new Map<string, UnitKey>();
for (const u of UNITS) for (const alias of [u.key, u.label, u.plural]) UNIT_ALIASES.set(alias, u.key);
for (const [alias, key] of Object.entries({
  gram: "g", grams: "g",
  kilogram: "kg", kilograms: "kg",
  millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  litre: "l", litres: "l", liter: "l", liters: "l",
  piece: "pcs", pieces: "pcs",
  teaspoon: "tsp", teaspoons: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp",
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

export function parseIngredient(text: string): Omit<ParsedIngredient, "line"> | { error: string } {
  const rest = text.replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim();
  const match = QUANTITY.exec(rest);
  if (!match) return { name: rest, quantity: null, unit: null };

  const quantity = parseQuantity(match[1]);
  if (!(quantity > 0)) return { error: "Quantity must be more than 0." };

  const afterQuantity = rest.slice(match[0].length).trim();
  if (/^[-–]\s*\d/.test(afterQuantity)) return { error: "Ranges aren't supported; pick one quantity." };
  const [word, ...nameWords] = afterQuantity.split(" ");
  const unit = UNIT_ALIASES.get(word.toLowerCase().replace(/\.$/, ""));
  const name = unit ? nameWords.join(" ") : afterQuantity;
  if (!name) return { error: "Missing the ingredient name after the quantity." };
  return { name, quantity, unit: unit ?? "pcs" };
}

function sectionOf(line: string): Section | null {
  const word = line.trim().replace(/^#+\s*/, "").replace(/:$/, "").trim().toLowerCase();
  return (SECTIONS as readonly string[]).includes(word) ? (word as Section) : null;
}

export function parseRecipeText(text: string): { recipe: ParsedRecipe; errors: ImportError[] } {
  const lines = text.split(/\r?\n/);
  const errors: ImportError[] = [];
  const recipe: ParsedRecipe = { name: "", servingSize: null, ingredients: [], instructions: null, comments: null };
  const seen = new Set<Section>();
  const freeText: Record<"instructions" | "comments", string[]> = { instructions: [], comments: [] };
  let section: Section | "header" = "header";
  let servesLine: number | null = null;

  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();

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
        const serves = /^serves\s+(\S+)$/i.exec(trimmed);
        if (serves && servesLine == null) {
          servesLine = line;
          const n = Number(serves[1]);
          if (Number.isInteger(n) && n >= 1) recipe.servingSize = n;
          else errors.push({ line, message: "Servings must be a whole number of at least 1." });
          return;
        }
        errors.push({ line, message: 'Expected "Serves <number>" or the "Ingredients" heading.' });
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
  else if (servesLine == null) errors.push({ line: null, message: 'Add a "Serves <number>" line below the name.' });
  if (!seen.has("ingredients")) errors.push({ line: null, message: 'Add an "Ingredients" heading.' });
  else if (recipe.ingredients.length === 0) errors.push({ line: null, message: "List at least one ingredient." });

  errors.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
  return { recipe, errors };
}
