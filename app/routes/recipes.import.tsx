import { Alert, Anchor, Badge, Button, Card, Code, Container, Group, List, SimpleGrid, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { IconAlertCircle, IconCheck, IconFileImport } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { FormError } from "~/components/form-error";
import { IngredientName } from "~/components/ingredient-name";
import { Markdown } from "~/components/markdown";
import { SubmitButton } from "~/components/submit-button";
import { Weblink } from "~/components/weblink";
import { db } from "~/db/client";
import { importRecipe } from "~/db/recipes.server";
import { items, recipes } from "~/db/schema";
import { text } from "~/forms";
import { itemKey, itemKeys, parseRecipeText } from "~/recipe-import";
import { formatAmount, UNITS } from "~/units";
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
  return [{ title: "Import Recipe – Shopocalypse" }];
}

export async function loader() {
  const allItems = await db.select({ name: items.name, plural: items.plural }).from(items);
  const recipeNames = await db.select({ name: recipes.name }).from(recipes).where(eq(recipes.archived, false));
  return { knownItemKeys: allItems.flatMap(itemKeys), recipeNames: recipeNames.map((r) => r.name) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  // Parsed again here rather than trusting the preview
  const { recipe, errors } = parseRecipeText(text(form, "text"));
  if (errors.length || recipe.servingSize == null) return { error: "Fix the errors in the text first.", imported: null };

  const { id, newItems } = await importRecipe({ ...recipe, servingSize: recipe.servingSize });
  return { error: null, imported: { id, name: recipe.name, newItems } };
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
        <List.Item>A note after <Code> - </Code>, a comma or in parentheses is kept with the ingredient: <Code>1 onion - diced</Code></List.Item>
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

// Shown instead of the form once a recipe is imported
// Navigating to this same route keeps the component mounted, so the caller
// clears its text through onImportAnother
function Imported({ id, name, newItems, onImportAnother }: {
  id: number;
  name: string;
  newItems: { id: number; name: string }[];
  onImportAnother: () => void;
}) {
  return (
    <Container size="sm" py="xl">
      <Alert color="green" variant="light" icon={<IconCheck size={16} />} title={`Imported "${name}"`} mb="lg">
        {newItems.length > 0 && (
          <>
            <Text size="sm" mb="xs">
              {newItems.length === 1 ? "This new item has" : `These ${newItems.length} new items have`} no store or shelf yet,
              so the shopping list can't sort {newItems.length === 1 ? "it" : "them"}:
            </Text>
            <List size="sm">
              {newItems.map((item) => (
                <List.Item key={item.id}>
                  <Anchor component={Link} to={`/items/${item.id}`} size="sm">{item.name}</Anchor>
                </List.Item>
              ))}
            </List>
          </>
        )}
      </Alert>
      <Group>
        <Button component={Link} to={`/recipes/${id}`}>Open recipe</Button>
        <Button component={Link} to="/recipes/import" onClick={onImportAnother} variant="light" leftSection={<IconFileImport size={16} />}>
          Import another
        </Button>
        {newItems.length > 0 && <Button component={Link} to="/items" variant="subtle">All items</Button>}
      </Group>
    </Container>
  );
}

export default function ImportRecipe({ loaderData, actionData }: Route.ComponentProps) {
  const { knownItemKeys, recipeNames } = loaderData;
  const [input, setInput] = useState("");
  const { recipe, errors } = useMemo(() => parseRecipeText(input), [input]);
  const knownItems = useMemo(() => new Set(knownItemKeys), [knownItemKeys]);
  const errorLines = new Set(errors.flatMap((e) => (e.line != null ? [e.line] : [])));

  if (actionData?.imported) return <Imported {...actionData.imported} onImportAnother={() => setInput("")} />;

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
                    <Table.Td c="dimmed" style={{ width: 90 }}>{formatAmount(ing)}</Table.Td>
                    <Table.Td>
                      <IngredientName {...ing}>
                        {!knownItems.has(itemKey(ing.name)) && (
                          <Badge size="xs" variant="light" color="orange" ml={6}>new item</Badge>
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
