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
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconPhoto, IconPlayerPlay, IconPlus, IconRefresh, IconTrash, IconX } from "@tabler/icons-react";
import { asc, desc, eq } from "drizzle-orm";
import { useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { type PickableRecipe, RecipePicker } from "~/components/recipe-picker";
import { ServingsControl } from "~/components/servings";
import { SortableList, useReorder } from "~/components/sortable-list";
import { ThawWarning } from "~/components/thaw-warning";
import { db } from "~/db/client";
import { photoUrl } from "~/db/recipe-photos.server";
import { formatCookedAt, mealServings, pickableRecipes, withIngredients } from "~/db/recipes.server";
import { autoFill, reorderSchedule, scheduleRecipe } from "~/db/schedule.server";
import * as schema from "~/db/schema";
import type { Tag } from "~/db/tags.server";
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

  const allRecipes = await pickableRecipes();

  const recentlyCooked = await db
    .select({ id: schema.mealHistory.id, recipeId: schema.recipes.id, name: schema.recipes.name, cookedAt: schema.mealHistory.cookedAt })
    .from(schema.mealHistory)
    .innerJoin(schema.recipes, eq(schema.mealHistory.recipeId, schema.recipes.id))
    .orderBy(desc(schema.mealHistory.cookedAt), desc(schema.mealHistory.id))
    .limit(10)
    .then((rows) => rows.map((r) => ({ ...r, cookedAt: formatCookedAt(r.cookedAt) })));

  return { scheduled, allRecipes, recentlyCooked };
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
      break;
    }

    case "auto-fill": {
      const count = int(form, "count");
      if (!count || count > MAX_AUTO_FILL) return { autoFillError: `Bitte eine Zahl von 1 bis ${MAX_AUTO_FILL} wählen.` };
      const { error } = await autoFill(count, newServings, int(form, "tagId"), form.get("excludeTag") === "1");
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

export default function Home({ loaderData }: Route.ComponentProps) {
  const { allRecipes, recentlyCooked } = loaderData;
  const [scheduled, reorder] = useReorder(loaderData.scheduled, (m) => m.position, "reorder");
  const [picking, setPicking] = useState(false);
  const scheduledCounts = new Map<number, number>();
  for (const m of scheduled) scheduledCounts.set(m.id, (scheduledCounts.get(m.id) ?? 0) + 1);
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

      {allRecipes.length > 0 && (
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setPicking(true)}>
          Mahlzeiten hinzufügen
        </Button>
      )}
      <RecipePicker
        opened={picking}
        onClose={() => setPicking(false)}
        title="Zum Speiseplan hinzufügen"
        recipes={allRecipes}
        counts={scheduledCounts}
        countLabel="im Speiseplan"
        defaultServings={4}
        addIntent="add"
        // The last one, which is the furthest off
        removeFields={(recipeId) => {
          const meal = [...scheduled].reverse().find((m) => m.id === recipeId);
          return meal ? { intent: "remove", position: String(meal.position) } : null;
        }}
        markNoAutoFill
        footer={({ tag, excludeTag, servings }) => <AutoFill recipes={allRecipes} tag={tag} excludeTag={excludeTag} servings={servings} />}
      />

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

// Appends the recipes cooked longest ago, only those with (or without) the picker's tag when one is chosen
function AutoFill({ recipes, tag, excludeTag, servings }: { recipes: PickableRecipe[]; tag: Tag | null; excludeTag: boolean; servings: string }) {
  const fetcher = useFetcher<typeof action>();
  const available = recipes.some((r) => r.autoFill && (!tag || r.tags.some((t) => t.id === tag.id) !== excludeTag));
  const error = fetcher.data && "autoFillError" in fetcher.data ? fetcher.data.autoFillError : null;

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="auto-fill" />
      <input type="hidden" name="servings" value={servings} />
      {tag && <input type="hidden" name="tagId" value={tag.id} />}
      {tag && excludeTag && <input type="hidden" name="excludeTag" value="1" />}
      <Group gap="xs" wrap="nowrap">
        <NumberInput name="count" aria-label="Anzahl" min={1} max={MAX_AUTO_FILL} allowDecimal={false} defaultValue={3} w={70} />
        <Button type="submit" variant="light" leftSection={<IconRefresh size={16} />} loading={fetcher.state !== "idle"} disabled={!available}>
          Auffüllen
        </Button>
      </Group>
      <Text size="xs" c={available && !error ? "dimmed" : "red"} mt={4}>
        {error ?? (available
          ? `Hängt die am längsten nicht gekochten Rezepte${tag ? ` ${excludeTag ? "ohne" : "mit"} „${tag.name}“` : ""} an`
          : `Kein Rezept ${excludeTag ? "ohne" : "mit"} diesem Tag ist fürs Auffüllen vorgesehen.`)}
      </Text>
    </fetcher.Form>
  );
}
