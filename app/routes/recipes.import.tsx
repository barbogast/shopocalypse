import { Alert, Anchor, Badge, Button, Card, Checkbox, Code, Container, Group, List, SimpleGrid, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { IconAlertCircle, IconCheck, IconFileImport, IconSparkles } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { eq } from "drizzle-orm";
import { Form, Link, useFetcher } from "react-router";
import { FormError } from "~/components/form-error";
import { IngredientName } from "~/components/ingredient-name";
import { Markdown } from "~/components/markdown";
import { SubmitButton } from "~/components/submit-button";
import { Weblink } from "~/components/weblink";
import { db } from "~/db/client";
import { setPlural } from "~/db/items.server";
import { AcceptedSchema, applySuggestions } from "~/item-suggest.server";
import type { action as suggestAction } from "~/routes/items.suggest";
import { importRecipe } from "~/db/recipes.server";
import { itemCategories, items, recipes, stores } from "~/db/schema";
import { editItemPath, int, text } from "~/forms";
import { itemKey, itemKeys, likelySingular, type ParsedIngredient, parseRecipeText } from "~/recipe-import";
import { formatAmount, UNITS, unitName, type UnitKey } from "~/units";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/recipes.import";

const PLACEHOLDER = `Spaghetti Carbonara
4
https://example.com/carbonara
---
400 g spaghetti
4 eggs
salt
---
Boil the pasta…
---
Optional notes`;

export function meta({}: Route.MetaArgs) {
  return [{ title: pageTitle("Import Recipe") }];
}

export async function loader() {
  const allItems = await db.select({ id: items.id, name: items.name, plural: items.plural }).from(items);
  const recipeNames = await db.select({ name: recipes.name }).from(recipes).where(eq(recipes.archived, false));
  // Names for the suggested stores and shelves of new items
  const allStores = await db.select({ id: stores.id, name: stores.name }).from(stores);
  const allShelves = await db.select({ id: itemCategories.id, name: itemCategories.name }).from(itemCategories);
  return { allItems, recipeNames: recipeNames.map((r) => r.name), allStores, allShelves };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();

  // From the preview's plural suggestion, through a fetcher; the loader then matches the ingredient
  if (form.get("intent") === "set-plural") {
    const itemId = int(form, "itemId");
    const plural = text(form, "plural");
    if (!itemId || !plural) return { error: "Pick an item and a plural.", imported: null };
    return { ...(await setPlural(itemId, plural)), imported: null };
  }

  // From the suggestions for the new items, through a fetcher
  if (form.get("intent") === "apply-suggestions") {
    let accepted;
    try {
      accepted = AcceptedSchema.safeParse(JSON.parse(text(form, "accepted")));
    } catch {
      accepted = null;
    }
    if (!accepted?.success) return { error: "Those suggestions couldn't be read.", imported: null };
    return { error: null, imported: null, shelved: await applySuggestions(accepted.data) };
  }

  // Parsed again here rather than trusting the preview
  const { recipe, errors } = parseRecipeText(text(form, "text"));
  if (errors.length || recipe.servingSize == null) return { error: "Fix the errors in the text first.", imported: null };

  // Lines whose note was ticked in the preview to go on the shopping list
  const noteOnListLines = new Set(form.getAll("noteOnList").map(Number));
  const ingredients = recipe.ingredients.map((ing) => ({ ...ing, noteOnList: ing.note !== null && noteOnListLines.has(ing.line) }));
  const { id, newItems, storeName } = await importRecipe({ ...recipe, servingSize: recipe.servingSize, ingredients });
  return { error: null, imported: { id, name: recipe.name, newItems, storeName } };
}

// The text format, kept in view while typing (the placeholder disappears)
function FormatHelp() {
  return (
    <Card withBorder radius="md" p="md">
      <Title order={5} mb="xs">Format</Title>
      <Code block mb="sm">{PLACEHOLDER}</Code>
      <List size="sm" spacing={4}>
        <List.Item>
          The number is the servings; <Code>---</Code> separates ingredients, instructions and comments.
          The headings <Code>Ingredients</Code>, <Code>Instructions</Code>, <Code>Comments</Code> work too, as do <Code>Serves 4</Code>, <Code>4 Personen</Code>, <Code>4 Portionen</Code> and <Code>für 4</Code>
        </List.Item>
        <List.Item>The weblink below the name is optional; it must start with <Code>https://</Code> or <Code>www.</Code></List.Item>
        <List.Item>Instructions and comments are optional; instructions support markdown</List.Item>
        <List.Item>A quantity without a unit means pieces; a line without a quantity has none</List.Item>
        <List.Item>Quantities: <Code>1.5</Code>, <Code>1,5</Code>, <Code>1/2</Code>, <Code>1 1/2</Code>, <Code>½</Code>; no ranges</List.Item>
        <List.Item>Units: {UNITS.map((u) => u.label).join(", ")}, in English (<Code>tbsp</Code>) or spelled out (<Code>Esslöffel</Code>)</List.Item>
        <List.Item>A note after <Code> - </Code>, a comma or in parentheses is kept with the ingredient: <Code>1 onion - diced</Code>. Tick it in the preview if it matters when buying, like <Code>mind. 30% Fett</Code></List.Item>
        <List.Item>Quotes keep a comma, dash or parentheses in the name: <Code>"Salz, Pfeffer"</Code></List.Item>
        <List.Item>Ingredients are matched to items by name or plural (without the note); unknown names become new items</List.Item>
      </List>
    </Card>
  );
}

// Shared by the textarea and its gutter so wrapped lines line up; the left
// padding leaves room for three-digit line numbers
const TEXT_METRICS = {
  fontFamily: "var(--mantine-font-family-monospace)",
  fontSize: "var(--mantine-font-size-sm)",
  lineHeight: "var(--mantine-line-height)",
  padding: "8px 12px 8px calc(3ch + 20px)",
} as const;

// Line numbers drawn over the textarea. Each line is repeated here in
// transparent text so it wraps exactly like the textarea and its number sits on
// its first row; the textarea autosizes, so there's no scrolling to keep in sync.
function LineGutter({ text, errorLines }: { text: string; errorLines: Set<number> }) {
  return (
    <div
      aria-hidden
      style={{
        ...TEXT_METRICS,
        position: "absolute",
        inset: 0,
        border: "1px solid transparent",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        color: "transparent",
      }}
    >
      {text.split(/\r?\n/).map((line, i) => (
        <div key={i} style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              right: "calc(100% + 10px)",
              color: errorLines.has(i + 1) ? "var(--mantine-color-red-6)" : "var(--mantine-color-dimmed)",
              fontWeight: errorLines.has(i + 1) ? 700 : undefined,
            }}
          >
            {i + 1}
          </span>
          {line || " "}
        </div>
      ))}
    </div>
  );
}

// Offers to save an unknown ingredient name as the plural of the item it probably is, which
// then matches it. Never matched without asking: guessing plurals goes wrong too often.
function PluralSuggestion({ name, singular }: { name: string; singular: { id: number; name: string } | undefined }) {
  const fetcher = useFetcher<typeof action>();
  if (!singular) return null;
  return (
    <fetcher.Form method="post" style={{ display: "inline" }}>
      <input type="hidden" name="intent" value="set-plural" />
      <input type="hidden" name="itemId" value={singular.id} />
      <input type="hidden" name="plural" value={name} />
      <Button type="submit" size="compact-xs" variant="subtle" ml={4} loading={fetcher.state !== "idle"}>
        Plural of {singular.name}?
      </Button>
      {fetcher.data?.error && <Text span size="xs" c="red" ml={4}>{fetcher.data.error}</Text>}
    </fetcher.Form>
  );
}

// Lists the new items on top, and editing one comes back there, since this page is gone once left
const NEWEST_ITEMS = "/items?by=newest";

type NewItem = { id: number; name: string; storeId: number | null; defaultUnit: UnitKey | null };
type Names = { stores: { id: number; name: string }[]; shelves: { id: number; name: string }[]; items: { id: number; name: string }[] };

// Asks for a shelf, unit, plural and parent for all the new items at once, and saves the ticked ones.
// Like the item form, it renames plural names to their singular and otherwise only fills in what's still empty.
function SuggestForNewItems({ newItems, names, onShelved }: {
  newItems: NewItem[];
  names: Names;
  onShelved: (ids: number[]) => void;
}) {
  const suggest = useFetcher<typeof suggestAction>();
  const apply = useFetcher<typeof action>();
  const [unticked, setUnticked] = useState(() => new Set<number>());
  const applied = apply.data && "shelved" in apply.data ? apply.data.shelved : null;

  useEffect(() => {
    if (applied) onShelved(applied);
  }, [applied]);

  const nameOf = (list: { id: number; name: string }[], id: number | null) => list.find((x) => x.id === id)?.name;
  const suggestions = suggest.data && "suggestions" in suggest.data ? suggest.data.suggestions : null;
  // What each suggestion would fill in; items it has nothing new for are left out
  const rows = (suggestions ?? []).flatMap((s, i) => {
    const item = newItems[i];
    const store = item.storeId == null ? nameOf(names.stores, s.storeId) : undefined;
    const shelf = item.storeId == null || item.storeId === s.storeId ? nameOf(names.shelves, s.categoryId) : undefined;
    const changes = [
      s.singular && `rename to ${s.singular}`,
      store && shelf ? `${store} › ${shelf}` : store ?? shelf,
      item.defaultUnit == null && s.defaultUnit && unitName(s.defaultUnit),
      s.plural && `plural ${s.plural}`,
      s.parentId != null && `variant of ${nameOf(names.items, s.parentId)}`,
    ].filter(Boolean);
    return changes.length ? [{ item, suggestion: s, changes }] : [];
  });
  const accepted = rows.filter((r) => !unticked.has(r.item.id)).map((r) => ({ itemId: r.item.id, ...r.suggestion }));

  if (applied) {
    return <Text size="sm" c="dimmed" mb="lg">Saved the suggestions.</Text>;
  }
  return (
    <Card withBorder radius="md" p="md" mb="lg">
      <Group justify="space-between" mb={suggestions ? "sm" : 0}>
        <Text size="sm">Let Claude suggest a shelf, unit, plural and parent for the new items, and fix plural names.</Text>
        <suggest.Form method="post" action="/items/suggest">
          {newItems.map((item) => (
            <span key={item.id}>
              <input type="hidden" name="name" value={item.name} />
              <input type="hidden" name="itemId" value={item.id} />
            </span>
          ))}
          <Button type="submit" size="xs" variant="light" leftSection={<IconSparkles size={14} />} loading={suggest.state !== "idle"}>
            Suggest
          </Button>
        </suggest.Form>
      </Group>
      {suggest.data && "error" in suggest.data && <Text size="sm" c="red">{suggest.data.error}</Text>}
      {suggestions && rows.length === 0 && <Text size="sm" c="dimmed">No suggestions for these items.</Text>}
      {rows.length > 0 && (
        <apply.Form method="post">
          <input type="hidden" name="intent" value="apply-suggestions" />
          <input type="hidden" name="accepted" value={JSON.stringify(accepted)} />
          <Table mb="sm">
            <Table.Tbody>
              {rows.map(({ item, changes }) => (
                <Table.Tr key={item.id}>
                  <Table.Td style={{ width: 30 }}>
                    <Checkbox
                      aria-label={`Use the suggestion for ${item.name}`}
                      checked={!unticked.has(item.id)}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setUnticked((prev) => {
                          const next = new Set(prev);
                          if (checked) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                    />
                  </Table.Td>
                  <Table.Td>{item.name}</Table.Td>
                  <Table.Td c="dimmed">{changes.join(" · ")}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {apply.data?.error && <Text size="sm" c="red" mb="xs">{apply.data.error}</Text>}
          <Button type="submit" size="xs" disabled={accepted.length === 0} loading={apply.state !== "idle"}>
            Apply {accepted.length} of {rows.length}
          </Button>
        </apply.Form>
      )}
    </Card>
  );
}

// Shown instead of the form once a recipe is imported
// Navigating to this same route keeps the component mounted, so the caller
// clears its text through onImportAnother
function Imported({ id, name, newItems, storeName, names, onImportAnother }: {
  id: number;
  name: string;
  newItems: NewItem[];
  storeName: string | null;
  names: Names;
  onImportAnother: () => void;
}) {
  // Items given a shelf by accepted suggestions
  const [shelved, setShelved] = useState<number[]>([]);
  const unsorted = newItems.filter((i) => !shelved.includes(i.id));

  return (
    <Container size="sm" py="xl">
      <Alert color="green" variant="light" icon={<IconCheck size={16} />} title={`Imported "${name}"`} mb="lg">
        {unsorted.length > 0 && (
          <>
            <Text size="sm" mb="xs">
              {unsorted.length === 1 ? "This new item has" : `These ${unsorted.length} new items have`}{" "}
              {storeName ? `no shelf in ${storeName} yet` : "no store or shelf yet"},
              so the shopping list can't sort {unsorted.length === 1 ? "it" : "them"}:
            </Text>
            <List size="sm">
              {unsorted.map((item) => (
                <List.Item key={item.id}>
                  <Anchor component={Link} to={editItemPath(item.id, NEWEST_ITEMS)} size="sm">{item.name}</Anchor>
                </List.Item>
              ))}
            </List>
          </>
        )}
      </Alert>
      {newItems.length > 0 && <SuggestForNewItems newItems={newItems} names={names} onShelved={setShelved} />}
      <Group>
        <Button component={Link} to={`/recipes/${id}`}>Open recipe</Button>
        <Button component={Link} to="/recipes/import" onClick={onImportAnother} variant="light" leftSection={<IconFileImport size={16} />}>
          Import another
        </Button>
        {newItems.length > 0 && <Button component={Link} to={NEWEST_ITEMS} variant="subtle">Newest items</Button>}
      </Group>
    </Container>
  );
}

// Identifies a ticked note across edits of the text, which move its line
const noteKey = (ing: ParsedIngredient) => `${itemKey(ing.name)}\n${ing.note}`;

export default function ImportRecipe({ loaderData, actionData }: Route.ComponentProps) {
  const { allItems, recipeNames, allStores, allShelves } = loaderData;
  const [input, setInput] = useState("");
  const [notesOnList, setNotesOnList] = useState(() => new Set<string>());
  const toggleNoteOnList = (ing: ParsedIngredient, checked: boolean) =>
    setNotesOnList((prev) => {
      const next = new Set(prev);
      if (checked) next.add(noteKey(ing));
      else next.delete(noteKey(ing));
      return next;
    });
  const { recipe, errors } = useMemo(() => parseRecipeText(input), [input]);
  const knownItems = useMemo(() => new Set(allItems.flatMap(itemKeys)), [allItems]);
  const errorLines = new Set(errors.flatMap((e) => (e.line != null ? [e.line] : [])));

  if (actionData?.imported) {
    const importAnother = () => {
      setInput("");
      setNotesOnList(new Set());
    };
    const names = { stores: allStores, shelves: allShelves, items: allItems };
    return <Imported {...actionData.imported} names={names} onImportAnother={importAnother} />;
  }

  const newItemCount = recipe.ingredients.filter((ing) => !knownItems.has(itemKey(ing.name))).length;
  const nameTaken = recipe.name !== "" && recipeNames.some((n) => itemKey(n) === itemKey(recipe.name));
  const canImport = input.trim() !== "" && errors.length === 0;

  return (
    <Container size="lg" py="xl">
      <Title mb="lg">Import recipe</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Form method="post">
          <Stack>
            <Textarea
              name="text"
              label="Recipe text"
              description="See the format below"
              placeholder={PLACEHOLDER}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              autosize
              minRows={16}
              autoFocus
              styles={{ input: TEXT_METRICS }}
              inputContainer={(children) => (
                <div style={{ position: "relative" }}>
                  {children}
                  {input !== "" && <LineGutter text={input} errorLines={errorLines} />}
                </div>
              )}
            />
            {recipe.ingredients
              .filter((ing) => ing.note && notesOnList.has(noteKey(ing)))
              .map((ing) => <input key={ing.line} type="hidden" name="noteOnList" value={ing.line} />)}
            <FormError error={actionData?.error} />
            <Group>
              <SubmitButton disabled={!canImport}>Import</SubmitButton>
              {canImport && newItemCount > 0 && (
                <Text size="sm" c="dimmed">
                  Creates {newItemCount} new item{newItemCount === 1 ? "" : "s"}
                </Text>
              )}
            </Group>
            <FormatHelp />
          </Stack>
        </Form>

        <Stack>
          {input.trim() !== "" && errors.length > 0 && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py="xs">
              <List size="sm">
                {errors.map((e, i) => (
                  <List.Item key={i}>{e.line != null && <b>Line {e.line}: </b>}{e.message}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          {nameTaken && (
            <Alert color="yellow" variant="light" py="xs">
              There's already a recipe called "{recipe.name}"; importing adds a second one.
            </Alert>
          )}

          <Card withBorder radius="md" p="md">
            <Title order={3}>{recipe.name || <Text span c="dimmed" inherit>Name</Text>}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {recipe.servingSize ? `Serves ${recipe.servingSize}` : "Serves —"}
              {recipe.weblink && <> · <Weblink href={recipe.weblink} size="sm" /></>}
            </Text>

            <Title order={5} mb={4}>Ingredients</Title>
            <Table mb="md">
              <Table.Tbody>
                {recipe.ingredients.map((ing) => (
                  <Table.Tr key={ing.line}>
                    <Table.Td c="dimmed" ta="right" style={{ width: 90, verticalAlign: "top" }}>{formatAmount(ing)}</Table.Td>
                    <Table.Td>
                      <IngredientName {...ing} noteControl={
                        <Checkbox size="xs" label="Note on shopping list" checked={notesOnList.has(noteKey(ing))}
                          onChange={(e) => toggleNoteOnList(ing, e.currentTarget.checked)} />
                      }>
                        {!knownItems.has(itemKey(ing.name)) && (
                          <>
                            <Badge size="xs" variant="light" color="orange" ml={6}>new item</Badge>
                            <PluralSuggestion name={ing.name} singular={likelySingular(ing.name, allItems)} />
                          </>
                        )}
                      </IngredientName>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {recipe.ingredients.length === 0 && (
                  <Table.Tr>
                    <Table.Td c="dimmed">None yet.</Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>

            <Title order={5} mb={4}>Instructions</Title>
            {recipe.instructions ? <Markdown>{recipe.instructions}</Markdown> : <Text size="sm" c="dimmed" mb="md">—</Text>}

            <Title order={5} mb={4}>Comments</Title>
            {recipe.comments
              ? <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{recipe.comments}</Text>
              : <Text size="sm" c="dimmed">—</Text>}
          </Card>
        </Stack>
      </SimpleGrid>
    </Container>
  );
}
