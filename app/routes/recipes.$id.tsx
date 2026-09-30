import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { and, asc, eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { ItemFields } from "~/components/item-fields";
import { db } from "~/db/client";
import { listShelves, parseItemForm } from "~/db/items.server";
import { deleteOrArchiveRecipe, hasBeenCooked, restoreRecipe } from "~/db/recipes.server";
import { items, recipeIngredients, recipes, stores } from "~/db/schema";
import { DEFAULT_UNIT, formatAmount, parseAmount, UNIT_OPTIONS } from "~/units";
import type { Route } from "./+types/recipes.$id";

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!recipe) throw new Response("Not found", { status: 404 });

  const ingredients = await db
    .select({ itemId: items.id, name: items.name, quantity: recipeIngredients.quantity, unit: recipeIngredients.unit })
    .from(recipeIngredients)
    .innerJoin(items, eq(recipeIngredients.itemId, items.id))
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(items.name));

  const allItems = await db
    .select({ id: items.id, name: items.name, defaultUnit: items.defaultUnit })
    .from(items)
    .orderBy(items.name);

  const allStores = await db.select().from(stores).orderBy(stores.name);

  return { recipe, ingredients, allItems, allStores, allShelves: listShelves(), cooked: hasBeenCooked(id) };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const name = String(form.get("name")).trim();
    const servingSize = Number(form.get("servingSize"));
    const instructions = String(form.get("instructions") ?? "").trim() || null;
    const comments = String(form.get("comments") ?? "").trim() || null;
    if (!name || servingSize < 1) return { error: "Name and serving size are required." };
    await db.update(recipes).set({ name, servingSize, instructions, comments }).where(eq(recipes.id, id));
  }

  if (intent === "add-ingredient") {
    const itemId = Number(form.get("itemId"));
    if (!itemId) return { error: "Select an item." };
    const parsed = parseAmount(form);
    if ("error" in parsed) return { error: parsed.error };
    const { quantity, unit } = parsed.amount;
    await db
      .insert(recipeIngredients)
      .values({ recipeId: id, itemId, quantity, unit })
      .onConflictDoUpdate({ target: [recipeIngredients.recipeId, recipeIngredients.itemId], set: { quantity, unit } });
  }

  // New item from the ingredient picker; it's then preselected for adding
  if (intent === "create-item") {
    const parsed = parseItemForm(form);
    if (parsed.error) return { createError: parsed.error };
    const [item] = await db
      .insert(items)
      .values(parsed.values)
      .returning({ id: items.id, name: items.name, defaultUnit: items.defaultUnit });
    return { createdItem: item };
  }

  if (intent === "remove-ingredient") {
    const itemId = Number(form.get("itemId"));
    await db
      .delete(recipeIngredients)
      .where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.itemId, itemId)));
  }

  if (intent === "delete") {
    deleteOrArchiveRecipe(id);
    return redirect("/recipes");
  }

  if (intent === "restore") {
    restoreRecipe(id);
  }

  return null;
}

export default function RecipeDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { recipe, ingredients, allItems, allStores, allShelves, cooked } = loaderData;
  const usedItemIds = new Set(ingredients.map((i) => i.itemId));
  const availableItems = allItems
    .filter((i) => !usedItemIds.has(i.id))
    .map((i) => ({ value: String(i.id), label: i.name }));
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<string | null>(DEFAULT_UNIT);
  const [createOpened, createModal] = useDisclosure(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  // Offer to create the searched-for item when no item has that name yet
  const searchName = search.trim();
  const canCreate = searchName !== "" && !allItems.some((i) => i.name.toLowerCase() === searchName.toLowerCase());
  const itemOptions = canCreate
    ? [...availableItems, { value: "__create__", label: `+ Create "${searchName}"` }]
    : availableItems;

  const selectItem = (item: (typeof allItems)[number] | undefined) => {
    setItemId(item ? String(item.id) : null);
    setSearch(item?.name ?? "");
    setUnit(item?.defaultUnit ?? DEFAULT_UNIT);
  };

  // Clear the picker once its item has been added to the recipe
  useEffect(() => {
    if (itemId && usedItemIds.has(Number(itemId))) selectItem(undefined);
  }, [ingredients]);

  useEffect(() => {
    if (actionData && "createError" in actionData) setCreateError(actionData.createError ?? null);
    // Arrives before the loader reruns, so the new item isn't in allItems yet
    if (actionData && "createdItem" in actionData) {
      createModal.close();
      selectItem(actionData.createdItem);
      quantityRef.current?.focus();
    }
  }, [actionData]);

  return (
    <Container size="sm" py="xl">
      {/* Kept outside the save form: forms can't be nested */}
      <Form method="post" id="recipe-status-form">
        <input type="hidden" name="intent" value={recipe.archived ? "restore" : "delete"} />
      </Form>
      <Group justify="space-between" mb="md">
        {recipe.archived ? <Badge color="gray">Archived</Badge> : <span />}
        <Button component={Link} to={`/cook/${recipe.id}`} color="green" leftSection={<IconPlayerPlay size={16} />}>
          Cook now
        </Button>
      </Group>
      <Form method="post" id="recipe-form">
        <input type="hidden" name="intent" value="save" />
        <Stack mb="xl">
          <TextInput name="name" label="Name" defaultValue={recipe.name} required />
          <NumberInput name="servingSize" label="Serving size" defaultValue={recipe.servingSize} min={1} required />
          {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
          <Group>
            <Button type="submit">Save</Button>
            {recipe.archived ? (
              <Button type="submit" form="recipe-status-form" variant="subtle" ml="auto"
                leftSection={<IconArchiveOff size={16} />}>
                Restore recipe
              </Button>
            ) : cooked ? (
              <Button type="submit" form="recipe-status-form" variant="subtle" color="gray" ml="auto"
                leftSection={<IconArchive size={16} />}>
                Archive recipe
              </Button>
            ) : (
              <Button type="submit" form="recipe-status-form" variant="subtle" color="red" ml="auto"
                leftSection={<IconTrash size={16} />}>
                Delete recipe
              </Button>
            )}
          </Group>
        </Stack>
      </Form>

      <Title order={3} mb="sm">Ingredients</Title>

      <Table mb="md">
        <Table.Tbody>
          {ingredients.map((ing) => (
            <Table.Tr key={ing.itemId}>
              <Table.Td>{ing.name}</Table.Td>
              <Table.Td c="dimmed" style={{ width: 90 }}>{formatAmount(ing)}</Table.Td>
              <Table.Td style={{ width: 40 }}>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-ingredient" />
                  <input type="hidden" name="itemId" value={ing.itemId} />
                  <ActionIcon variant="subtle" color="red" type="submit">
                    <IconTrash size={16} />
                  </ActionIcon>
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
          {ingredients.length === 0 && (
            <Table.Tr>
              <Table.Td c="dimmed">No ingredients yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Form method="post">
        <input type="hidden" name="intent" value="add-ingredient" />
        <Group align="flex-end" gap="xs">
          <Select
            name="itemId"
            label="Add ingredient"
            placeholder="Search or create…"
            data={itemOptions}
            value={itemId}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            onChange={(value) => {
              if (value === "__create__") {
                setCreateName(searchName);
                setCreateError(null);
                createModal.open();
              } else {
                selectItem(allItems.find((i) => String(i.id) === value));
              }
            }}
            style={{ flex: 1, minWidth: 140 }}
          />
          {/* Leave the quantity empty for ingredients without one, like spices */}
          <NumberInput ref={quantityRef} name="quantity" label="Qty" min={0} decimalScale={2} placeholder="—" style={{ width: 70 }} />
          <Select name="unit" label="Unit" data={UNIT_OPTIONS} value={unit} onChange={setUnit} style={{ width: 95 }} />
          <Button type="submit">Add</Button>
        </Group>
      </Form>

      <Modal opened={createOpened} onClose={createModal.close} title="New item">
        <Form method="post">
          <input type="hidden" name="intent" value="create-item" />
          <Stack>
            <ItemFields
              stores={allStores}
              shelves={allShelves}
              defaults={{ name: createName, defaultUnit: unit }}
              autoFocus
            />
            {createError && <p style={{ color: "red" }}>{createError}</p>}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={createModal.close}>Cancel</Button>
              <Button type="submit">Create</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>

      {/* Part of the save form above via the `form` attribute */}
      <Stack mt="xl">
        <Textarea
          form="recipe-form"
          name="instructions"
          label="Cooking instructions"
          description="Supports markdown"
          defaultValue={recipe.instructions ?? ""}
          autosize
          minRows={4}
        />
        <Textarea
          form="recipe-form"
          name="comments"
          label="Comments"
          defaultValue={recipe.comments ?? ""}
          autosize
          minRows={2}
        />
        <Group>
          <Button type="submit" form="recipe-form">Save</Button>
        </Group>
      </Stack>
    </Container>
  );
}
