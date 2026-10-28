// The order auto-fill takes recipes in: unscheduled ones by least recently cooked (never
// cooked first), then scheduled ones in the order they come up in the queue. `queue` is the
// schedule's recipe ids in order; `lastCooked` maps a recipe id to its last YYYY-MM-DD.
export function rotationOrder<T extends { id: number }>(recipes: T[], queue: number[], lastCooked: Map<number, string | null>): T[] {
  // Last position in the queue per recipe (later entries overwrite earlier ones)
  const queuePos = new Map(queue.map((recipeId, i) => [recipeId, i]));
  return [...recipes].sort((a, b) => {
    const aPos = queuePos.get(a.id) ?? -1;
    const bPos = queuePos.get(b.id) ?? -1;
    if (aPos !== bPos) return aPos - bPos;
    const aDate = lastCooked.get(a.id) ?? "";
    const bDate = lastCooked.get(b.id) ?? "";
    return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
  });
}
