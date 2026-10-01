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
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconCheck, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { and, asc, desc, eq } from "drizzle-orm";
import { Form, Link, redirect, useNavigation } from "react-router";
import { ItemFields } from "~/components/item-fields";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { listShelves, parseItemForm } from "~/db/items.server";
import { deleteOrArchiveRecipe, formatCookedAt, restoreRecipe } from "~/db/recipes.server";
import { items, mealHistory, recipeIngredients, recipes, stores } from "~/db/schema";
import { int, optionalText, text } from "~/forms";
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

  const cookedDates = await db
    .select({ id: mealHistory.id, cookedAt: mealHistory.cookedAt })
    .from(mealHistory)
    .where(eq(mealHistory.recipeId, id))
    .orderBy(desc(mealHistory.cookedAt), desc(mealHistory.id))
    .then((rows) => rows.map((r) => ({ ...r, cookedAt: formatCookedAt(r.cookedAt) })));

  return { recipe, ingredients, allItems, allStores, allShelves: listShelves(), cookedDates };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const name = text(form, "name");
    const servingSize = int(form, "servingSize");
    const instructions = optionalText(form, "instructions");
    const comments = optionalText(form, "comments");
    if (!name || !servingSize) return { error: "Name and a whole-number serving size are required." };
    await db.update(recipes).set({ name, servingSize, instructions, comments }).where(eq(recipes.id, id));
    return { saved: true };
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

// Save button for the recipe form: spins while saving, then confirms until the next edit
function SaveButton({ saved }: { saved: boolean }) {
  const navigation = useNavigation();
  const saving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save";

  return (
    <Group gap="xs">
      <Button type="submit" form="recipe-form" loading={saving}>Save</Button>
      {saved && !saving && (
        <Group gap={4} c="green">
          <IconCheck size={16} />
          <Text size="sm">Saved</Text>
        </Group>
      )}
    </Group>
  );
}

export default function RecipeDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { recipe, ingredients, allItems, allStores, allShelves, cookedDates } = loaderData;
  const cooked = cookedDates.length > 0;
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
  const [saved, setSaved] = useState(false);
  const markUnsaved = () => setSaved(false);

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
    if (actionData && "saved" in actionData) setSaved(true);
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
      <Form method="post" id="recipe-form" onChange={markUnsaved}>
        <input type="hidden" name="intent" value="save" />
        <Stack mb="xl">
          <TextInput name="name" label="Name" defaultValue={recipe.name} required />
          <NumberInput name="servingSize" label="Serving size" defaultValue={recipe.servingSize} min={1} allowDecimal={false} required />
          {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
          <Group>
            <SaveButton saved={saved} />
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
          <SubmitButton>Add</SubmitButton>
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
              <SubmitButton>Create</SubmitButton>
            </Group>
          </Stack>
        </Form>
      </Modal>

      {/* Part of the save form above via the `form` attribute; their change events don't reach its onChange */}
      <Stack mt="xl">
        <Textarea
          form="recipe-form"
          name="instructions"
          onChange={markUnsaved}
          label="Cooking instructions"
          description="Supports markdown"
          defaultValue={recipe.instructions ?? ""}
          autosize
          minRows={4}
        />
        <Textarea
          form="recipe-form"
          name="comments"
          onChange={markUnsaved}
          label="Comments"
          defaultValue={recipe.comments ?? ""}
          autosize
          minRows={2}
        />
        <SaveButton saved={saved} />
      </Stack>

      <Title order={3} mt="xl" mb="sm">Cooked</Title>
      {cooked ? (
        <Stack gap={2}>
          <Text size="sm" c="dimmed" mb={4}>{cookedDates.length === 1 ? "Once" : `${cookedDates.length} times`}</Text>
          {cookedDates.map((d) => <Text key={d.id} size="sm">{d.cookedAt}</Text>)}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">Not cooked yet.</Text>
      )}
    </Container>
  );
}
