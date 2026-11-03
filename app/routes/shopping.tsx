import { Button, Container, CopyButton, Divider, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { eq, sql } from "drizzle-orm";
import { Form, type ShouldRevalidateFunctionArgs, useActionData, useFetchers, useRevalidator, useSubmit } from "react-router";
import { FormError } from "~/components/form-error";
import { LocalDateTime } from "~/components/local-date-time";
import { AddItemForm } from "~/components/shopping/add-item-form";
import { ImportItemsButton } from "~/components/shopping/import-items-button";
import { ListItemRow } from "~/components/shopping/list-item-row";
import { ListMeals } from "~/components/shopping/list-meals";
import { PrepareList } from "~/components/shopping/prepare-list";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { loadItemFormOptions } from "~/db/items.server";
import {
  addItemsToList,
  addItemToList,
  addMeal,
  addOneOffToList,
  discardList,
  finishList,
  getActiveList,
  listItemsInOrder,
  listMealsWithRecipes,
  listScheduledMeals,
  prepareList,
  removeListItem,
  removeMeal,
  setBought,
} from "~/db/shopping.server";
import * as schema from "~/db/schema";
import { confirmFirst, int, text } from "~/forms";
import { pageTitle } from "~/page-title";
import { parseItemsText } from "~/recipe-import";
import { listAsText } from "~/shopping-list";
import * as outbox from "~/tick-outbox";
import { groupByStoreAndShelf } from "~/store-shelf-groups";
import { parseAmount } from "~/units";
import type { Route } from "./+types/shopping";

export function meta() {
  return [{ title: pageTitle("Einkaufsliste") }];
}

export async function loader() {
  const activeList = await getActiveList();
  const scheduled = await listScheduledMeals();
  if (!activeList) {
    return { activeList: null, listItems: [], scheduled };
  }

  const listItems = await listItemsInOrder(activeList.id);
  // Items already on the list can be added again to raise their amount
  const listedItemIds = new Set(listItems.map((i) => i.itemId));
  const allItems = await db
    .select({ id: schema.items.id, name: schema.items.name, plural: schema.items.plural, defaultUnit: schema.items.defaultUnit })
    .from(schema.items)
    .orderBy(sql`${schema.items.name} collate nocase`)
    .then((all) => all.map((i) => ({ ...i, listed: listedItemIds.has(i.id) })));

  const allRecipes = await db
    .select({ id: schema.recipes.id, name: schema.recipes.name, servingSize: schema.recipes.servingSize })
    .from(schema.recipes)
    .where(eq(schema.recipes.archived, false))
    .orderBy(sql`${schema.recipes.name} collate nocase`);

  return {
    activeList,
    listRecipes: await listMealsWithRecipes(activeList.id),
    listItems,
    scheduled,
    allItems,
    allRecipes,
    ...await loadItemFormOptions(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  switch (intent) {
    case "prepare": {
      const positions = form.getAll("position").map(Number).filter(Number.isInteger);
      await prepareList(positions, form.get("includeInStock") === "on");
      break;
    }

    case "add-manual": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      const itemId = int(form, "itemId");
      const parsed = parseAmount(form);
      if (!itemId) return { addError: "Bitte zuerst eine Zutat wählen." };
      if ("error" in parsed) return { addError: parsed.error };
      await addItemToList(activeList.id, itemId, parsed.amount);
      break;
    }

    // Something not in the item catalog, on this list only
    case "add-one-off": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      const name = text(form, "name");
      const parsed = parseAmount(form);
      if (!name) return { addError: "Bitte einen Namen angeben." };
      if ("error" in parsed) return { addError: parsed.error };
      const { error } = await addOneOffToList(activeList.id, {
        name,
        storeId: int(form, "storeId"),
        categoryId: int(form, "categoryId"),
        amount: parsed.amount,
      });
      if (error) return { addError: error };
      // Tells the form to go back to picking an item
      return { oneOffAdded: true };
    }

    // Items pasted as text, one per line like a recipe's ingredients
    case "import-items": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      // Parsed again here rather than trusting the preview
      const allItems = await db.select({ name: schema.items.name, plural: schema.items.plural }).from(schema.items);
      const { items, errors } = parseItemsText(text(form, "text"), allItems);
      if (errors.length) return { importError: "Bitte zuerst die Fehler im Text beheben." };
      if (items.length === 0) return { importError: "Mindestens eine Zutat angeben." };
      const { newItems } = await addItemsToList(activeList.id, items);
      return { itemsImported: { count: items.length, newItems: newItems.length } };
    }

    case "add-recipe": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      const recipeId = int(form, "recipeId");
      // Empty means the recipe's serving size
      const servings = int(form, "servings");
      if (!recipeId) return { addRecipeError: "Bitte zuerst ein Rezept wählen." };
      if (text(form, "servings") && !servings) return { addRecipeError: "Die Portionen müssen eine ganze Zahl ab 1 sein." };
      const { error } = await addMeal(activeList, recipeId, servings);
      if (error) return { addRecipeError: error };
      // Tells the page to clear its recipe picker
      return { recipeAdded: true };
    }

    case "remove-recipe": {
      const activeList = await getActiveList();
      const id = int(form, "id");
      if (!activeList || !id) return null;
      await removeMeal(activeList, id);
      break;
    }

    case "tick":
    case "untick": {
      const id = int(form, "id");
      if (!id) return null;
      await setBought(id, intent === "tick");
      break;
    }

    case "remove-item": {
      const id = int(form, "id");
      if (!id) return null;
      await removeListItem(id);
      break;
    }

    // Only the list the page showed: a page left open on another phone may
    // still show a list that has since been replaced
    case "finish":
    case "discard": {
      const activeList = await getActiveList();
      if (!activeList || activeList.id !== int(form, "listId")) {
        return { listError: "Die Liste hat sich inzwischen geändert. Hier ist die aktuelle." };
      }
      await (intent === "finish" ? finishList : discardList)(activeList.id);
      break;
    }
    default:
      throw new Response("Unknown intent", { status: 400 });
  }

  return null;
}

// The last list that loaded, kept for when a reload fails
let lastLoaded: Awaited<ReturnType<Route.ClientLoaderArgs["serverLoader"]>> | undefined;

// A failed reload, often just poor reception in the shop, keeps showing the
// last list instead of replacing it with the error page
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  try {
    lastLoaded = await serverLoader();
    return lastLoaded;
  } catch (error) {
    if (lastLoaded) return lastLoaded;
    throw error;
  }
}

// Ticks go to the outbox first, and the fetcher actions never throw: a thrown
// error, even just from a lost connection, would replace the whole list with
// the error page
export async function clientAction({ request, serverAction }: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  const intent = form.get("intent");
  const id = int(form, "id");

  if ((intent === "tick" || intent === "untick") && id) {
    const bought = intent === "tick";
    outbox.queue(id, bought);
    try {
      await serverAction();
      outbox.markSynced(id, bought);
    } catch {
      // Stays in the outbox and is sent again later
    }
    return null;
  }
  if (intent === "remove-item") {
    try {
      return await serverAction();
    } catch {
      return { removeError: "Konnte nicht entfernt werden. Bitte noch mal versuchen." };
    }
  }
  return serverAction();
}

// The outbox keeps ticks showing, so reloading the whole list after each one
// would only cost round trips in the shop. Changes made on another device come
// in through useReloadList.
export function shouldRevalidate({ formData, actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const intent = formData?.get("intent");
  if (intent === "tick" || intent === "untick") return false;
  // The reload would fail the same way, and show the error page
  if (actionResult?.removeError) return false;
  return defaultShouldRevalidate;
}

// Sends the outbox's unsent ticks when there's a chance they'll get through:
// on load, when the connection or the page comes back, and every 30 seconds,
// since the phone can claim to be online with too little reception to use
function useFlushOutbox() {
  const submit = useSubmit();

  useEffect(() => {
    const flush = () => {
      for (const { id, bought } of outbox.unsynced(outbox.getSnapshot())) {
        // One fetcher per item, so a resend replaces the previous attempt
        submit({ intent: bought ? "tick" : "untick", id }, { method: "post", navigate: false, fetcherKey: `outbox-${id}` });
      }
    };
    const onVisible = () => document.visibilityState === "visible" && flush();
    flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(flush, 30_000);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [submit]);
}

// Reloads the list when the page comes back into view and every 30 seconds
// while it's open, so changes made on another phone show up. Skipped while
// something is being sent, so a reload can't overtake it.
function useReloadList() {
  const revalidator = useRevalidator();
  const fetchers = useFetchers();
  const latest = useRef({ revalidator, busy: false });
  latest.current = { revalidator, busy: fetchers.some((f) => f.state !== "idle") };

  useEffect(() => {
    const reload = () => {
      const { revalidator, busy } = latest.current;
      if (document.visibilityState === "visible" && revalidator.state === "idle" && !busy) revalidator.revalidate();
    };
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("online", reload);
    const timer = setInterval(reload, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("online", reload);
      clearInterval(timer);
    };
  }, []);
}

export type ActiveListData = Extract<Awaited<ReturnType<typeof loader>>, { activeList: object }>;
export type ListRecipe = ActiveListData["listRecipes"][number];
export type ListItem = ActiveListData["listItems"][number];

// Applies ticks and removals that are still on their way to the server
function withPendingChanges(listItems: ListItem[], fetchers: ReturnType<typeof useFetchers>) {
  const pending = new Map<number, FormDataEntryValue | null>();
  for (const f of fetchers) {
    if (f.formData) pending.set(Number(f.formData.get("id")), f.formData.get("intent"));
  }
  return listItems
    .filter((i) => pending.get(i.id) !== "remove-item")
    .map((i) => {
      const intent = pending.get(i.id);
      return intent === "tick" ? { ...i, bought: true } : intent === "untick" ? { ...i, bought: false } : i;
    });
}

export default function Shopping({ loaderData }: Route.ComponentProps) {
  // The first load comes with the page, past clientLoader
  useEffect(() => {
    lastLoaded = loaderData;
  }, [loaderData]);
  useReloadList();

  if (!loaderData.activeList) return <PrepareList scheduled={loaderData.scheduled} />;
  return <ListView {...loaderData} />;
}

function ListView({
  activeList,
  listRecipes,
  listItems: loadedItems,
  allItems,
  allRecipes,
  allStores,
  allShelves,
  parents,
}: ActiveListData) {
  const entries = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getServerSnapshot);
  const fetchers = useFetchers();
  const listItems = withPendingChanges(outbox.applyEntries(loadedItems, entries), fetchers);
  // Not counting ticks still on their way, so a tick that goes through doesn't flash this up
  const sending = new Set(fetchers.filter((f) => f.formData).map((f) => Number(f.formData!.get("id"))));
  const unsentCount = outbox.unsynced(entries).filter((e) => !sending.has(e.id)).length;
  useFlushOutbox();
  const actionData = useActionData<typeof action>();

  // Each fresh load of the list has what the server already got
  useEffect(() => outbox.settle(loadedItems), [loadedItems]);

  const groups = groupByStoreAndShelf(listItems);
  const tickedCount = listItems.filter((i) => i.bought).length;

  // Which of the list's meals use each item
  const recipesByItem = new Map<number, string[]>();
  for (const recipe of listRecipes) {
    const label = recipe.count > 1 ? `${recipe.name} ×${recipe.count}` : recipe.name;
    for (const ing of recipe.ingredients) {
      recipesByItem.set(ing.itemId, [...(recipesByItem.get(ing.itemId) ?? []), label]);
    }
  }

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="xs">
        <Title>Einkaufsliste</Title>
        <Group gap="sm">
          {unsentCount > 0 && <Text c="orange" size="sm">{unsentCount} noch nicht gespeichert</Text>}
          <Text c="dimmed" size="sm">{tickedCount}/{listItems.length}</Text>
          {/* Copies what's still to buy, to paste into another app */}
          <CopyButton value={listAsText(listItems)}>
            {({ copied, copy }) => (
              <Button
                size="xs"
                variant="light"
                color={copied ? "green" : undefined}
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                disabled={tickedCount === listItems.length}
                onClick={copy}
              >
                {copied ? "Kopiert" : "Liste kopieren"}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Group>
      <Text c="dimmed" size="sm">Erstellt am <LocalDateTime iso={activeList.createdAt} /></Text>
      <ListMeals recipes={listRecipes} allRecipes={allRecipes} />

      {listItems.length === 0 && (
        <Text c="dimmed" mb="lg">Keine Zutaten auf der Liste.</Text>
      )}

      {[...groups.entries()].map(([storeName, shelves]) => (
        <Stack key={storeName} mb="lg" gap="xs">
          <Title order={4}>{storeName}</Title>
          <Table>
            <Table.Tbody>
              {[...shelves.entries()].flatMap(([shelfName, shelfItems]) => [
                // No heading when nothing in this store has a shelf
                ...(shelfName != null || shelves.size > 1
                  ? [
                      // A tinted band, so the shelves stand apart from the items between them
                      <Table.Tr key={`shelf-${shelfName ?? ""}`} bg="var(--mantine-color-gray-light)">
                        <Table.Td colSpan={4} py={6}>
                          <Text size="sm" fw={700}>{shelfName ?? "Sonstiges"}</Text>
                        </Table.Td>
                      </Table.Tr>,
                    ]
                  : []),
                ...shelfItems.map((item) => (
                  <ListItemRow key={item.id} item={item} usedIn={item.itemId != null ? recipesByItem.get(item.itemId) : undefined} />
                )),
              ])}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}

      <Divider my="md" />
      <AddItemForm items={allItems} stores={allStores} shelves={allShelves} parents={parents} />
      <ImportItemsButton items={allItems} />

      <Divider my="lg" />
      <FormError error={actionData && "listError" in actionData ? actionData.listError : null} mt="xs" />
      <Group mt="xs">
        <Form method="post">
          <input type="hidden" name="intent" value="finish" />
          <input type="hidden" name="listId" value={activeList.id} />
          <SubmitButton color="green" disabled={tickedCount === 0}>
            Einkauf abschließen
          </SubmitButton>
        </Form>
        <Form method="post" onSubmit={confirmFirst("Diese Einkaufsliste mit allem darauf verwerfen?")}>
          <input type="hidden" name="intent" value="discard" />
          <input type="hidden" name="listId" value={activeList.id} />
          <SubmitButton variant="subtle" color="red">Liste verwerfen</SubmitButton>
        </Form>
      </Group>
    </Container>
  );
}
