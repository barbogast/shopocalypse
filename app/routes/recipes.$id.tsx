import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconCheck, IconHistory, IconPencil, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { Form, Link, redirect, useNavigation } from "react-router";
import { FormError } from "~/components/form-error";
import { IngredientName } from "~/components/ingredient-name";
import { ItemPicker, type PickerItem } from "~/components/item-picker";
import { MoveButtons } from "~/components/move-buttons";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { loadItemFormOptions } from "~/db/items.server";
import { recordRecipeVersion } from "~/db/recipe-versions";
import {
  deleteOrArchiveRecipe,
  formatCookedAt,
  moveIngredient,
  restoreRecipe,
  upsertIngredient,
  withIngredients,
} from "~/db/recipes.server";
import * as schema from "~/db/schema";
import { confirmFirst, int, optionalText, optionalUrl, text } from "~/forms";
import { DEFAULT_UNIT, formatAmount, parseAmount, UNIT_OPTIONS } from "~/units";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/recipes.$id";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: pageTitle(data?.recipe.name ?? "Rezept") }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, id));
  if (!recipe) throw new Response("Not found", { status: 404 });

  const [{ ingredients }] = await withIngredients([{ ...recipe, servings: recipe.servingSize }]);

  const allItems = await db
    .select({ id: schema.items.id, name: schema.items.name, plural: schema.items.plural, defaultUnit: schema.items.defaultUnit })
    .from(schema.items)
    .orderBy(sql`${schema.items.name} collate nocase`);

  const cookedDates = await db
    .select({ id: schema.mealHistory.id, cookedAt: schema.mealHistory.cookedAt })
    .from(schema.mealHistory)
    .where(eq(schema.mealHistory.recipeId, id))
    .orderBy(desc(schema.mealHistory.cookedAt), desc(schema.mealHistory.id))
    .then((rows) => rows.map((r) => ({ ...r, cookedAt: formatCookedAt(r.cookedAt) })));

  const { versionCount } = await db
    .select({ versionCount: count() })
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, id))
    .get() ?? { versionCount: 0 };

  return {
    recipe, ingredients, allItems, ...await loadItemFormOptions(), cookedDates, versionCount,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  switch (intent) {
    case "save": {
      const name = text(form, "name");
      const servingSize = int(form, "servingSize");
      const instructions = optionalText(form, "instructions");
      const comments = optionalText(form, "comments");
      const weblink = optionalUrl(form, "weblink");
      const autoFill = form.get("autoFill") === "on";
      if (!name || !servingSize) return { error: "Name und eine ganze Zahl als Portionen sind erforderlich." };
      if (weblink === undefined) return { error: "Der Weblink muss eine Webadresse sein, z. B. https://example.com/rezept." };
      await db.update(schema.recipes).set({ name, servingSize, instructions, comments, weblink, autoFill }).where(eq(schema.recipes.id, id));
      await recordRecipeVersion(db, id);
      return { saved: true };
    }

    case "add-ingredient": {
      const itemId = int(form, "itemId");
      if (!itemId) return { ingredientError: "Bitte einen Artikel wählen." };
      const parsed = parseAmount(form);
      if ("error" in parsed) return { ingredientError: parsed.error };
      const { quantity, unit } = parsed.amount;
      const note = optionalText(form, "note");
      const noteOnList = note !== null && form.get("noteOnList") === "on";
      // Also how an existing ingredient is edited
      await upsertIngredient(id, itemId, { quantity, unit, note, noteOnList });
      await recordRecipeVersion(db, id);
      break;
    }

    case "move-ingredient": {
      const itemId = int(form, "itemId");
      if (!itemId) return null;
      await moveIngredient(id, itemId, form.get("direction") === "up");
      await recordRecipeVersion(db, id);
      break;
    }

    case "remove-ingredient": {
      const itemId = int(form, "itemId");
      if (!itemId) return null;
      await db
        .delete(schema.recipeIngredients)
        .where(and(eq(schema.recipeIngredients.recipeId, id), eq(schema.recipeIngredients.itemId, itemId)));
      await recordRecipeVersion(db, id);
      break;
    }

    case "delete": {
      await deleteOrArchiveRecipe(id);
      return redirect("/recipes");
    }

    case "restore": {
      await restoreRecipe(id);
      break;
    }
    default:
      throw new Response("Unknown intent", { status: 400 });
  }

  return null;
}

// Save button for the recipe form: spins while saving, then confirms until the next edit
function SaveButton({ saved }: { saved: boolean }) {
  const navigation = useNavigation();
  const saving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save";

  return (
    <Group gap="xs">
      <Button type="submit" form="recipe-form" loading={saving}>Speichern</Button>
      {saved && !saving && (
        <Group gap={4} c="green">
          <IconCheck size={16} />
          <Text size="sm">Gespeichert</Text>
        </Group>
      )}
    </Group>
  );
}

export default function RecipeDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { recipe, ingredients, allItems, allStores, allShelves, parents, cookedDates, versionCount } = loaderData;
  const cooked = cookedDates.length > 0;
  const usedItemIds = new Set(ingredients.map((i) => i.itemId));
  // The ingredient loaded into the form for editing, which stays selectable
  const [editingId, setEditingId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState<string | number>(1);
  const [unit, setUnit] = useState<string | null>(DEFAULT_UNIT);
  const [note, setNote] = useState("");
  const [noteOnList, setNoteOnList] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const markUnsaved = () => setSaved(false);

  const selectItem = (item: PickerItem | undefined) => {
    setItemId(item ? String(item.id) : null);
    setSearch(item?.name ?? "");
    setUnit(item?.defaultUnit ?? DEFAULT_UNIT);
    // Items without a default unit, like spices, usually come without a quantity
    setQuantity(item && !item.defaultUnit ? "" : 1);
    setEditingId(null);
  };

  const resetForm = () => {
    selectItem(undefined);
    setNote("");
    setNoteOnList(false);
  };

  const editIngredient = (ing: (typeof ingredients)[number]) => {
    setItemId(String(ing.itemId));
    setSearch(ing.name);
    setQuantity(ing.quantity ?? "");
    setUnit(ing.unit ?? DEFAULT_UNIT);
    setNote(ing.note ?? "");
    setNoteOnList(ing.noteOnList);
    setEditingId(ing.itemId);
    quantityRef.current?.focus();
  };

  // Clear the form once its item has been added to the recipe
  useEffect(() => {
    if (itemId && usedItemIds.has(Number(itemId))) resetForm();
  }, [ingredients]);

  useEffect(() => {
    if (actionData && "saved" in actionData) setSaved(true);
  }, [actionData]);

  return (
    <Container size="sm" py="xl">
      {/* Kept outside the save form: forms can't be nested */}
      <Form method="post" id="recipe-status-form" onSubmit={recipe.archived ? undefined : confirmFirst(`${recipe.name} löschen?`)}>
        <input type="hidden" name="intent" value={recipe.archived ? "restore" : "delete"} />
      </Form>
      <Group justify="space-between" mb="md">
        {recipe.archived ? <Badge color="gray">Archiviert</Badge> : <span />}
        <Button component={Link} to={`/cook/${recipe.id}`} color="green" leftSection={<IconPlayerPlay size={16} />}>
          Jetzt kochen
        </Button>
      </Group>
      <Form method="post" id="recipe-form" onChange={markUnsaved}>
        <input type="hidden" name="intent" value="save" />
        <Stack mb="xl">
          <TextInput name="name" label="Name" defaultValue={recipe.name} required />
          <NumberInput name="servingSize" label="Portionen" defaultValue={recipe.servingSize} min={1} allowDecimal={false} required />
          <TextInput name="weblink" label="Weblink" placeholder="https://…" inputMode="url" defaultValue={recipe.weblink ?? ""} />
          <Checkbox name="autoFill" label="Beim Auffüllen berücksichtigen" defaultChecked={recipe.autoFill}
            description="Aus für gelegentliche Gerichte: Die kommen dann nur von Hand auf den Speiseplan" />
          <FormError error={actionData && "error" in actionData ? actionData.error : null} />
          <Group>
            <SaveButton saved={saved} />
            {recipe.archived ? (
              <Button type="submit" form="recipe-status-form" variant="subtle" ml="auto"
                leftSection={<IconArchiveOff size={16} />}>
                Rezept wiederherstellen
              </Button>
            ) : cooked ? (
              <Button type="submit" form="recipe-status-form" variant="subtle" color="gray" ml="auto"
                leftSection={<IconArchive size={16} />}>
                Rezept archivieren
              </Button>
            ) : (
              <Button type="submit" form="recipe-status-form" variant="subtle" color="red" ml="auto"
                leftSection={<IconTrash size={16} />}>
                Rezept löschen
              </Button>
            )}
          </Group>
        </Stack>
      </Form>

      <Title order={3} mb="sm">Zutaten</Title>

      <Table mb="md">
        <Table.Tbody>
          {ingredients.map((ing, index) => (
            // Top-aligned, so the amount stays level with the name when a note makes the row taller
            <Table.Tr key={ing.itemId} style={{ verticalAlign: "top" }}>
              <Table.Td px={0} style={{ width: 56 }}>
                <MoveButtons intent="move-ingredient" fields={{ itemId: ing.itemId }}
                  first={index === 0} last={index === ingredients.length - 1} />
              </Table.Td>
              <Table.Td c="dimmed" ta="right" style={{ width: 90, verticalAlign: "top" }}>{formatAmount(ing)}</Table.Td>
              <Table.Td><IngredientName {...ing} /></Table.Td>
              <Table.Td style={{ width: 40 }}>
                <ActionIcon variant="subtle" onClick={() => editIngredient(ing)} aria-label={`${ing.name} bearbeiten`}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Table.Td>
              <Table.Td style={{ width: 40 }}>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-ingredient" />
                  <input type="hidden" name="itemId" value={ing.itemId} />
                  <ActionIcon variant="subtle" color="red" type="submit" aria-label={`${ing.name} entfernen`}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
          {ingredients.length === 0 && (
            <Table.Tr>
              <Table.Td c="dimmed">Noch keine Zutaten.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Form method="post">
        <input type="hidden" name="intent" value="add-ingredient" />
        <Group align="flex-end" gap="xs">
          <ItemPicker
            name="itemId"
            label={editingId ? "Zutat bearbeiten" : "Zutat hinzufügen"}
            items={allItems}
            // The ingredient being edited stays selectable
            hidden={(i) => usedItemIds.has(i.id) && i.id !== editingId}
            value={itemId}
            search={search}
            onSearchChange={setSearch}
            onSelect={selectItem}
            onCreated={(item) => {
              selectItem(item);
              quantityRef.current?.focus();
            }}
            defaultUnit={unit}
            stores={allStores}
            shelves={allShelves}
            parents={parents}
          />
          {/* Leave the quantity empty for ingredients without one, like spices */}
          <NumberInput ref={quantityRef} name="quantity" label="Menge" min={0} decimalScale={2} decimalSeparator="," placeholder="—"
            value={quantity} onChange={setQuantity} style={{ width: 70 }} />
          <Select name="unit" label="Einheit" data={UNIT_OPTIONS} value={unit} onChange={setUnit} style={{ width: 120 }} />
        </Group>
        <Group align="flex-end" gap="xs" mt="xs">
          <TextInput name="note" placeholder="Anmerkung, z. B. fein gehackt" value={note}
            onChange={(e) => setNote(e.currentTarget.value)} style={{ flex: 1 }} />
          {/* For notes that matter when buying, like "mind. 30% Fett" */}
          <Checkbox name="noteOnList" label="Anmerkung auf die Einkaufsliste" mb={8} disabled={!note.trim()}
            checked={noteOnList && !!note.trim()} onChange={(e) => setNoteOnList(e.currentTarget.checked)} />
          {editingId && <Button variant="subtle" onClick={resetForm}>Abbrechen</Button>}
          <SubmitButton>{editingId ? "Speichern" : "Hinzufügen"}</SubmitButton>
        </Group>
        <FormError error={actionData && "ingredientError" in actionData ? actionData.ingredientError : null} mt="xs" />
      </Form>

      {/* Part of the save form above via the `form` attribute; their change events don't reach its onChange */}
      <Stack mt="xl">
        <Textarea
          form="recipe-form"
          name="instructions"
          onChange={markUnsaved}
          label="Zubereitung"
          description="Markdown möglich"
          defaultValue={recipe.instructions ?? ""}
          autosize
          minRows={4}
        />
        <Textarea
          form="recipe-form"
          name="comments"
          onChange={markUnsaved}
          label="Anmerkungen"
          defaultValue={recipe.comments ?? ""}
          autosize
          minRows={2}
        />
        <SaveButton saved={saved} />
      </Stack>

      <Title order={3} mt="xl" mb="sm">Gekocht</Title>
      {cooked ? (
        <Stack gap={2}>
          <Text size="sm" c="dimmed" mb={4}>{cookedDates.length === 1 ? "Einmal" : `${cookedDates.length}-mal`}</Text>
          {cookedDates.map((d) => <Text key={d.id} size="sm">{d.cookedAt}</Text>)}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">Noch nie gekocht.</Text>
      )}

      <Button component={Link} to={`/recipes/${recipe.id}/history`} variant="subtle" size="xs" px={0} mt="xl"
        leftSection={<IconHistory size={14} />}>
        Änderungsverlauf ({versionCount === 1 ? "1 Version" : `${versionCount} Versionen`})
      </Button>
    </Container>
  );
}
