import { type Amount, combineAmounts, formatAmount, formatAmounts, nameForAmounts, roundUpToBuy, scaleAmount, subtractAmounts } from "./units";

type Meal = { recipeId: number; servings: number; servingSize: number };
type Ingredient = Amount & {
  recipeId: number;
  itemId: number;
  alwaysAvailable: boolean;
  note: string | null;
  noteOnList: boolean;
};
// Part of an item's amounts that comes with a shopping-relevant note ("200 ml mind. 30% Fett")
export type ListNote = { note: string; amounts: Amount[] };

// What to buy per item for the given meals: each recipe's ingredients scaled to the
// meal's servings, added up and rounded up to what can be bought. Always-available
// items are assumed to be in stock unless includeInStock is set. Amounts whose note
// goes on the list are also added up per note; those aren't rounded up, so they never
// add up to more than the total.
export function listAmounts(meals: Meal[], ingredients: Ingredient[], includeInStock: boolean) {
  const needed = new Map<number, { amounts: Amount[]; notes: ListNote[] }>();
  for (const meal of meals) {
    for (const ing of ingredients) {
      if (ing.recipeId !== meal.recipeId || (ing.alwaysAvailable && !includeInStock)) continue;
      const amount = scaleAmount(ing, meal.servings, meal.servingSize);
      const entry = needed.get(ing.itemId) ?? { amounts: [], notes: [] };
      entry.amounts.push(amount);
      if (ing.noteOnList && ing.note) entry.notes = addNote(entry.notes, { note: ing.note, amounts: [amount] });
      needed.set(ing.itemId, entry);
    }
  }
  return new Map([...needed].map(([itemId, { amounts, notes }]) => [itemId, { amounts: roundUpToBuy(combineAmounts(amounts)), notes }]));
}

type ListedItem = { id: number; itemId: number; amounts: Amount[]; source: "meal_plan" | "stock_deficit" | "manual" };
export type ListChange =
  | { kind: "insert"; itemId: number; amounts: Amount[]; notes: ListNote[] }
  | { kind: "update"; id: number; amounts: Amount[]; notes: ListNote[]; buyAgain: boolean }
  | { kind: "delete"; id: number };

// How a list's items change when its meals go from `before` to `after`. Each item gets the
// difference between what the two sets of meals need, so amounts added by hand stay and the
// rounding up is redone for the meals that remain. Notes only come from meals, so they're
// replaced. An item the meals no longer need goes once nothing is left of it, unless it was
// added by hand; one that now needs more has to be bought again. An item that was taken off
// the list comes back only with what the added meals need on top.
export function changeListMeals(
  listed: ListedItem[],
  before: Meal[],
  after: Meal[],
  ingredients: Ingredient[],
  includeInStock: boolean,
): ListChange[] {
  const old = listAmounts(before, ingredients, includeInStock);
  const now = listAmounts(after, ingredients, includeInStock);
  const changes: ListChange[] = [];
  for (const itemId of new Set([...old.keys(), ...now.keys()])) {
    const oldAmounts = old.get(itemId)?.amounts ?? [];
    const needed = now.get(itemId);
    const more = subtractAmounts(needed?.amounts ?? [], oldAmounts);
    const less = subtractAmounts(oldAmounts, needed?.amounts ?? []);
    const notes = needed?.notes ?? [];
    const unchanged = more.length === 0 && less.length === 0 && JSON.stringify(notes) === JSON.stringify(old.get(itemId)?.notes ?? []);
    if (unchanged && old.has(itemId) && needed) continue;
    const row = listed.find((i) => i.itemId === itemId);
    if (!row) {
      if (needed && (more.length > 0 || !old.has(itemId))) changes.push({ kind: "insert", itemId, amounts: more, notes: needed.notes });
      continue;
    }
    const amounts = subtractAmounts([...row.amounts, ...more], less);
    if (!needed && amounts.length === 0 && row.source !== "manual") changes.push({ kind: "delete", id: row.id });
    else changes.push({ kind: "update", id: row.id, amounts, notes, buyAgain: more.length > 0 });
  }
  return changes;
}

// Adds notes to a list of them, adding up the amounts of ones with the same note
export function addNote(notes: ListNote[], ...added: ListNote[]): ListNote[] {
  const result = notes.map((n) => ({ ...n }));
  for (const { note, amounts } of added) {
    const same = result.find((n) => n.note === note);
    if (same) same.amounts = combineAmounts([...same.amounts, ...amounts]);
    else result.push({ note, amounts: combineAmounts(amounts) });
  }
  return result;
}

// The list as plain text to paste into other apps: one line per item still to buy, in list order,
// amount first ("500 g Tomaten"), with notes in brackets. No store or shelf headings, since apps
// that turn each pasted line into an entry would make those entries too.
export function listAsText(listItems: { itemName: string; itemPlural: string | null; amounts: Amount[]; notes: ListNote[]; bought: boolean }[]) {
  return listItems
    .filter((i) => !i.bought)
    .map((i) => {
      const amounts = combineAmounts(i.amounts).map(formatAmount).join(" + ");
      const name = nameForAmounts({ name: i.itemName, plural: i.itemPlural }, i.amounts);
      const notes = i.notes.map((n) => (n.amounts.length > 0 ? `${formatAmounts(n.amounts)} ${n.note}` : n.note));
      return [amounts, name].filter(Boolean).join(" ") + (notes.length > 0 ? ` (${notes.join("; ")})` : "");
    })
    .join("\n");
}
