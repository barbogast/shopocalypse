import { type Amount, combineAmounts, roundUpToBuy, scaleAmount } from "./units";

type Meal = { recipeId: number; servings: number; servingSize: number };
type Ingredient = Amount & { recipeId: number; itemId: number; alwaysAvailable: boolean };

// What to buy per item for the given meals: each recipe's ingredients scaled to the
// meal's servings, added up and rounded up to what can be bought. Always-available
// items are assumed to be in stock unless includeInStock is set.
export function listAmounts(meals: Meal[], ingredients: Ingredient[], includeInStock: boolean) {
  const needed = new Map<number, Amount[]>();
  for (const meal of meals) {
    for (const ing of ingredients) {
      if (ing.recipeId !== meal.recipeId || (ing.alwaysAvailable && !includeInStock)) continue;
      needed.set(ing.itemId, [...(needed.get(ing.itemId) ?? []), scaleAmount(ing, meal.servings, meal.servingSize)]);
    }
  }
  return new Map([...needed].map(([itemId, amounts]) => [itemId, roundUpToBuy(combineAmounts(amounts))]));
}
