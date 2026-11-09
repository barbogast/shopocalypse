import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Divider,
  Group,
  Image,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconPhoto, IconPlayerPlay, IconPlus, IconRefresh, IconTrash, IconUsers, IconX } from "@tabler/icons-react";
import { asc, desc, eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { Form, Link } from "react-router";
import { FormError } from "~/components/form-error";
import { RecipeSelect } from "~/components/recipe-select";
import { ServingsControl } from "~/components/servings";
import { SortableList, useReorder } from "~/components/sortable-list";
import { SubmitButton } from "~/components/submit-button";
import { TagBadge } from "~/components/tag-badge";
import { ThawWarning } from "~/components/thaw-warning";
import { db } from "~/db/client";
import { photoUrl } from "~/db/recipe-photos.server";
import { formatCookedAt, mealServings, withIngredients } from "~/db/recipes.server";
import { autoFill, reorderSchedule, scheduleRecipe } from "~/db/schedule.server";
import * as schema from "~/db/schema";
import { allTags, tagsByRecipe } from "~/db/tags.server";
import { confirmFirst, int, text } from "~/forms";
import { pageTitle } from "~/page-title";
import { parseOrder } from "~/reorder";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: pageTitle() }];
}

export async function loader() {
  const scheduled = await db
    .select({
      position: schema.mealSchedule.position,
      id: schema.recipes.id,
      name: schema.recipes.name,
      servings: mealServings(schema.mealSchedule.servings),
      servingSize: schema.recipes.servingSize,
      photoUpdatedAt: schema.recipePhotos.updatedAt,
    })
    .from(schema.mealSchedule)
    .innerJoin(schema.recipes, eq(schema.mealSchedule.recipeId, schema.recipes.id))
    .leftJoin(schema.recipePhotos, eq(schema.recipePhotos.recipeId, schema.recipes.id))
    .orderBy(asc(schema.mealSchedule.position))
    .then(withIngredients)
    .then((meals) => meals.map(({ photoUpdatedAt, ...m }) => ({ ...m, thumbnailUrl: photoUrl(m.id, photoUpdatedAt, "thumbnail") })));

  const allRecipes = await db
    .select({ id: schema.recipes.id, name: schema.recipes.name })
    .from(schema.recipes)
    .where(eq(schema.recipes.archived, false))
    .orderBy(schema.recipes.name)
    .then(async (rows) => {
      const tags = await tagsByRecipe();
      return rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] }));
    });

  const recentlyCooked = await db
    .select({ id: schema.mealHistory.id, recipeId: schema.recipes.id, name: schema.recipes.name, cookedAt: schema.mealHistory.cookedAt })
    .from(schema.mealHistory)
    .innerJoin(schema.recipes, eq(schema.mealHistory.recipeId, schema.recipes.id))
    .orderBy(desc(schema.mealHistory.cookedAt), desc(schema.mealHistory.id))
    .limit(10)
    .then((rows) => rows.map((r) => ({ ...r, cookedAt: formatCookedAt(r.cookedAt) })));

  return { scheduled, allRecipes, recentlyCooked, allTags: await allTags() };
}

// Guards against a typo like 300 filling the schedule for a year
const MAX_AUTO_FILL = 30;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");
  // A meal's new servings, or the servings for newly added meals (empty means
  // each recipe's serving size)
  const newServings = int(form, "servings");
  if (text(form, "servings") && !newServings) return { servingsError: "Die Portionen müssen eine ganze Zahl ab 1 sein." };
  const position = int(form, "position");

  switch (intent) {
    case "reorder": {
      const order = parseOrder(form.get("order"));
      if (order) await reorderSchedule(order);
      break;
    }

    case "servings": {
      if (!(position && newServings)) break;
      await db.update(schema.mealSchedule).set({ servings: newServings }).where(eq(schema.mealSchedule.position, position));
      break;
    }

    case "remove": {
      if (!position) break;
      await db.delete(schema.mealSchedule).where(eq(schema.mealSchedule.position, position));
      break;
    }

    // Also changes the auto-fill rotation, which goes by last-cooked date
    case "remove-history": {
      const historyId = int(form, "id");
      if (historyId) await db.delete(schema.mealHistory).where(eq(schema.mealHistory.id, historyId));
      break;
    }

    case "add": {
      const recipeId = int(form, "recipeId");
      if (!recipeId) return { addError: "Bitte zuerst ein Rezept wählen." };
      const { error } = await scheduleRecipe(recipeId, newServings);
      if (error) return { addError: error };
      // Tells the page to clear its recipe picker
      return { added: true };
    }

    case "auto-fill": {
      const count = int(form, "count");
      if (!count || count > MAX_AUTO_FILL) return { autoFillError: `Bitte eine Zahl von 1 bis ${MAX_AUTO_FILL} wählen.` };
      const { error } = await autoFill(count, newServings, int(form, "tagId"));
      if (error) return { autoFillError: error };
      break;
    }
    default:
      throw new Response("Unknown intent", { status: 400 });
  }

  return null;
}

const THUMBNAIL_SIZE = 72;
// How far a thumbnail reaches into the card's padding above and below, so it doesn't make the row taller
const THUMBNAIL_OVERHANG = 9;

function MealThumbnail({ url }: { url: string | null }) {
  return url ? (
    <Image src={url} alt="" w={THUMBNAIL_SIZE} h={THUMBNAIL_SIZE} radius="sm" />
  ) : (
    <Center w={THUMBNAIL_SIZE} h={THUMBNAIL_SIZE} bg="var(--mantine-color-default-hover)" style={{ borderRadius: "var(--mantine-radius-sm)" }}>
      <IconPhoto size={18} color="var(--mantine-color-dimmed)" />
    </Center>
  );
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { allRecipes, recentlyCooked, allTags } = loaderData;
  const [scheduled, reorder] = useReorder(loaderData.scheduled, (m) => m.position, "reorder");
  // Shared by the add and auto-fill forms
  const [newServings, setNewServings] = useState<string | number>(4);
  // The add form's recipe, cleared once it's added but kept when adding fails
  const [addRecipeId, setAddRecipeId] = useState<string | null>(null);
  useEffect(() => {
    if (actionData && "added" in actionData) setAddRecipeId(null);
  }, [actionData]);
  // Rows without a photo get an empty square, so the names stay aligned; none at all when no meal has one
  const showThumbnails = scheduled.some((m) => m.thumbnailUrl);

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Speiseplan</Title>

      {scheduled.length === 0 ? (
        <Text c="dimmed" mb="xl">Keine Mahlzeiten geplant.</Text>
      ) : (
        <Stack gap="xs" mb="xl">
          <SortableList items={scheduled} idOf={(m) => m.position} onReorder={reorder}>
            {(meal, i, grip) => {
              // The next meal gets the same row, marked and with the thaw warning and a prominent cook button
              const isNext = i === 0;
              const cookUrl = `/cook/${meal.id}?position=${meal.position}`;
              return (
                <Card withBorder radius="md" p="md"
                  style={isNext ? { borderColor: "var(--mantine-color-green-6)" } : undefined}>
                  {/* Other rows keep their buttons beside the name; the next meal's larger ones wrap below it on phones */}
                  <Group justify="space-between" wrap={isNext ? "wrap" : "nowrap"}>
                    <Group gap="xs" wrap="nowrap" style={isNext ? { flex: "1 1 220px" } : { flex: 1, minWidth: 0 }}>
                      {grip}
                      {showThumbnails && (
                        <UnstyledButton component={Link} to={cookUrl} aria-hidden tabIndex={-1} my={-THUMBNAIL_OVERHANG} style={{ flexShrink: 0 }}>
                          <MealThumbnail url={meal.thumbnailUrl} />
                        </UnstyledButton>
                      )}
                      <Stack gap={0}>
                        <Anchor component={Link} to={cookUrl} c="inherit">
                          {meal.name}
                        </Anchor>
                        <ServingsControl position={meal.position} servings={meal.servings} />
                      </Stack>
                    </Group>
                    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                      {/* Phones skip the number: the order shows it, and the name needs the width beside the photo */}
                      {isNext
                        ? <Badge color="green" variant="light">Als Nächstes</Badge>
                        : <Badge variant="outline" color="gray" visibleFrom="xs">#{i + 1}</Badge>}
                      {isNext && (
                        <Button component={Link} to={cookUrl} color="green" leftSection={<IconPlayerPlay size={16} />}>
                          Kochen
                        </Button>
                      )}
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="position" value={meal.position} />
                        <Button type="submit" variant="subtle" color="gray" size="xs" px={6} aria-label={`${meal.name} aus dem Speiseplan entfernen`}>
                          <IconX size={14} />
                        </Button>
                      </Form>
                    </Group>
                  </Group>
                  {isNext && <ThawWarning ingredients={meal.ingredients} mt="xs" />}
                </Card>
              );
            }}
          </SortableList>
        </Stack>
      )}

      <Divider mb="lg" />

      <Stack gap="md">
        {allRecipes.length > 0 && (
          <NumberInput
            label="Portionen"
            description="Für die unten hinzugefügten Mahlzeiten; leer heißt: wie im Rezept"
            placeholder="Wie im Rezept"
            min={1}
            allowDecimal={false}
            value={newServings}
            onChange={setNewServings}
            leftSection={<IconUsers size={16} />}
            error={actionData && "servingsError" in actionData ? actionData.servingsError : undefined}
            maw={260}
          />
        )}

        {allRecipes.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="servings" value={newServings} />
            <Group align="flex-end">
              <RecipeSelect
                name="recipeId"
                label="Zum Speiseplan hinzufügen"
                recipes={allRecipes}
                value={addRecipeId}
                onChange={setAddRecipeId}
                placeholder="Rezept wählen…"
                style={{ flex: 1 }}
              />
              <SubmitButton leftSection={<IconPlus size={16} />}>Hinzufügen</SubmitButton>
            </Group>
            <FormError error={actionData && "addError" in actionData ? actionData.addError : null} mt="xs" />
          </Form>
        )}

        {allRecipes.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="auto-fill" />
            <input type="hidden" name="servings" value={newServings} />
            <Group align="flex-end">
              <NumberInput
                name="count"
                label="Auffüllen"
                description="Hängt die am längsten nicht gekochten Rezepte an"
                min={1}
                max={MAX_AUTO_FILL}
                allowDecimal={false}
                defaultValue={3}
                style={{ width: 100 }}
              />
              {allTags.length > 0 && (
                <Select
                  name="tagId"
                  label="Nur mit Tag"
                  description="Für einen Mix mehrmals auffüllen"
                  data={allTags.map((t) => ({ value: String(t.id), label: t.name }))}
                  placeholder="Alle Rezepte"
                  clearable
                  renderOption={({ option }) => {
                    const tag = allTags.find((t) => String(t.id) === option.value);
                    return tag ? <TagBadge {...tag} size="sm" /> : option.label;
                  }}
                  style={{ flex: 1, minWidth: 140 }}
                />
              )}
              <SubmitButton variant="light" leftSection={<IconRefresh size={16} />}>
                Auffüllen
              </SubmitButton>
            </Group>
            <FormError error={actionData && "autoFillError" in actionData ? actionData.autoFillError : null} mt="xs" />
          </Form>
        )}
      </Stack>

      <Divider my="lg" />

      <Title order={4} mb="sm">Zuletzt gekocht</Title>
      {recentlyCooked.length === 0 ? (
        <Text size="sm" c="dimmed">Noch nichts gekocht.</Text>
      ) : (
        <Table>
          <Table.Tbody>
            {recentlyCooked.map((entry) => (
              <Table.Tr key={entry.id}>
                <Table.Td c="dimmed" style={{ width: 130, whiteSpace: "nowrap" }}>{entry.cookedAt}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/recipes/${entry.recipeId}`} c="inherit">{entry.name}</Anchor>
                </Table.Td>
                <Table.Td style={{ width: 40 }}>
                  <Form method="post" onSubmit={confirmFirst(`${entry.name} vom ${entry.cookedAt} aus dem Verlauf entfernen?`)}>
                    <input type="hidden" name="intent" value="remove-history" />
                    <input type="hidden" name="id" value={entry.id} />
                    <ActionIcon type="submit" variant="subtle" color="gray" aria-label={`${entry.name} vom ${entry.cookedAt} aus dem Verlauf entfernen`}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Form>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Container>
  );
}
