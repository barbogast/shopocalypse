import { type Amount, combineAmounts, formatAmount, formatAmounts, nameForAmounts, roundUpToBuy, scaleAmount } from "./units";

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
