import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconMinus, IconPlayerPlay, IconPlus, IconRefresh, IconTrash, IconUsers, IconX } from "@tabler/icons-react";
import { asc, desc, eq, gt, inArray, lt, max, notInArray, sql } from "drizzle-orm";
import { useState } from "react";
import { Form, Link } from "react-router";
import { RecipeDrawer } from "~/components/recipe-drawer";
import { db } from "~/db/client";
import { formatCookedAt, withIngredients } from "~/db/recipes.server";
import { mealHistory, mealSchedule, recipes } from "~/db/schema";
import { int } from "~/forms";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Shopocalypse" }];
}

export async function loader() {
  const scheduled = await db
    .select({
      position: mealSchedule.position,
      id: recipes.id,
      name: recipes.name,
      servings: sql<number>`coalesce(${mealSchedule.servings}, ${recipes.servingSize})`,
      servingSize: recipes.servingSize,
      instructions: recipes.instructions,
      comments: recipes.comments,
    })
    .from(mealSchedule)
    .innerJoin(recipes, eq(mealSchedule.recipeId, recipes.id))
    .orderBy(asc(mealSchedule.position))
    .then(withIngredients);

  const allRecipes = await db
    .select({ id: recipes.id, name: recipes.name })
    .from(recipes)
    .where(eq(recipes.archived, false))
    .orderBy(recipes.name);

  const recentlyCooked = await db
    .select({ id: mealHistory.id, recipeId: recipes.id, name: recipes.name, cookedAt: mealHistory.cookedAt })
    .from(mealHistory)
    .innerJoin(recipes, eq(mealHistory.recipeId, recipes.id))
    .orderBy(desc(mealHistory.cookedAt), desc(mealHistory.id))
    .limit(10)
    .then((rows) => rows.map((r) => ({ ...r, cookedAt: formatCookedAt(r.cookedAt) })));

  return { scheduled, allRecipes, recentlyCooked };
}

// Guards against a typo like 300 filling the schedule for a year
const MAX_AUTO_FILL = 30;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");
  // Servings for newly added meals; empty means each recipe's serving size
  const newServings = Number(form.get("servings")) || null;
  if (newServings != null && (!Number.isInteger(newServings) || newServings < 1)) return null;

  if (intent === "move") {
    const position = Number(form.get("position"));
    const up = form.get("direction") === "up";
    // Swap meals with the neighbouring entry (positions may have gaps)
    db.transaction((tx) => {
      const current = tx.select().from(mealSchedule).where(eq(mealSchedule.position, position)).get();
      const neighbour = tx
        .select()
        .from(mealSchedule)
        .where(up ? lt(mealSchedule.position, position) : gt(mealSchedule.position, position))
        .orderBy(up ? desc(mealSchedule.position) : asc(mealSchedule.position))
        .limit(1)
        .get();
      if (!current || !neighbour) return;
      tx.update(mealSchedule)
        .set({ recipeId: neighbour.recipeId, servings: neighbour.servings })
        .where(eq(mealSchedule.position, current.position))
        .run();
      tx.update(mealSchedule)
        .set({ recipeId: current.recipeId, servings: current.servings })
        .where(eq(mealSchedule.position, neighbour.position))
        .run();
    });
  }

  if (intent === "servings") {
    const position = Number(form.get("position"));
    const servings = Number(form.get("servings"));
    if (!Number.isInteger(servings) || servings < 1) return null;
    await db.update(mealSchedule).set({ servings }).where(eq(mealSchedule.position, position));
  }

  if (intent === "remove") {
    const position = Number(form.get("position"));
    await db.delete(mealSchedule).where(eq(mealSchedule.position, position));
  }

  // Also changes the auto-fill rotation, which goes by last-cooked date
  if (intent === "remove-history") {
    await db.delete(mealHistory).where(eq(mealHistory.id, Number(form.get("id"))));
  }

  if (intent === "add") {
    const recipeId = int(form, "recipeId");
    // Nothing picked, or a recipe that's gone or archived since the page loaded
    if (!recipeId) return null;
    const recipe = db.select().from(recipes).where(eq(recipes.id, recipeId)).get();
    if (!recipe || recipe.archived) return null;
    const [{ nextPos }] = await db
      .select({ nextPos: max(mealSchedule.position) })
      .from(mealSchedule);
    await db.insert(mealSchedule).values({ position: (nextPos ?? 0) + 1, recipeId, servings: newServings });
  }

  if (intent === "auto-fill") {
    const count = int(form, "count");
    if (!count || count > MAX_AUTO_FILL) return null;

    const queue = await db
      .select({ recipeId: mealSchedule.recipeId })
      .from(mealSchedule)
      .orderBy(asc(mealSchedule.position));
    // Last position in the queue per recipe (later entries overwrite earlier ones)
    const queuePos = new Map(queue.map((r, i) => [r.recipeId, i]));

    // Find the last-cooked date per recipe
    const lastCooked = await db
      .select({ recipeId: mealHistory.recipeId, lastDate: max(mealHistory.cookedAt) })
      .from(mealHistory)
      .groupBy(mealHistory.recipeId);
    const lastCookedMap = new Map(lastCooked.map((r) => [r.recipeId, r.lastDate]));

    // Rotation order: unscheduled recipes by least recently cooked (never cooked
    // first), then scheduled ones in the order they come up in the queue.
    const rotation = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.archived, false))
      .then((all) =>
        all.sort((a, b) => {
          const aPos = queuePos.get(a.id) ?? -1;
          const bPos = queuePos.get(b.id) ?? -1;
          if (aPos !== bPos) return aPos - bPos;
          const aDate = lastCookedMap.get(a.id) ?? "";
          const bDate = lastCookedMap.get(b.id) ?? "";
          return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
        })
      );

    if (rotation.length === 0) return null;

    const [{ nextPos }] = await db
      .select({ nextPos: max(mealSchedule.position) })
      .from(mealSchedule);
    const start = (nextPos ?? 0) + 1;
    // Loop through the rotation if more meals are requested than there are recipes
    await db.insert(mealSchedule).values(
      Array.from({ length: count }, (_, i) => ({
        position: start + i,
        recipeId: rotation[i % rotation.length].id,
        servings: newServings,
      }))
    );
  }

  return null;
}

function MoveButtons({ position, first, last }: { position: number; first: boolean; last: boolean }) {
  return (
    <Form method="post" style={{ display: "flex" }}>
      <input type="hidden" name="intent" value="move" />
      <input type="hidden" name="position" value={position} />
      <Button type="submit" name="direction" value="up" disabled={first}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Move up">
        <IconChevronUp size={14} />
      </Button>
      <Button type="submit" name="direction" value="down" disabled={last}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Move down">
        <IconChevronDown size={14} />
      </Button>
    </Form>
  );
}

function ServingsControl({ position, servings }: { position: number; servings: number }) {
  return (
    <Form method="post" style={{ display: "flex", alignItems: "center" }}>
      <input type="hidden" name="intent" value="servings" />
      <input type="hidden" name="position" value={position} />
      <Button type="submit" name="servings" value={servings - 1} disabled={servings <= 1}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Fewer servings">
        <IconMinus size={14} />
      </Button>
      <Group gap={4} wrap="nowrap" c="dimmed" aria-label={`${servings} servings`}>
        <IconUsers size={14} />
        <Text size="sm">{servings}</Text>
      </Group>
      <Button type="submit" name="servings" value={servings + 1}
        variant="subtle" color="gray" size="xs" px={6} aria-label="More servings">
        <IconPlus size={14} />
      </Button>
    </Form>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { scheduled, allRecipes, recentlyCooked } = loaderData;
  const [next, ...upcoming] = scheduled;

  const availableRecipes = allRecipes.map((r) => ({ value: String(r.id), label: r.name }));
  // Shared by the add and auto-fill forms
  const [newServings, setNewServings] = useState<string | number>("");
  // Tapping a meal's name opens its recipe details
  const [openPosition, setOpenPosition] = useState<number | null>(null);
  const open = scheduled.find((m) => m.position === openPosition);

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Meal schedule</Title>

      {!next ? (
        <Text c="dimmed" mb="xl">No meals scheduled.</Text>
      ) : (
        <Stack mb="xl">
          <Card withBorder shadow="sm" radius="md" p="lg">
            <Group justify="space-between" align="center">
              <Stack gap={4}>
                <Badge color="green" variant="light">Next up</Badge>
                <Title order={2}>
                  <Anchor component="button" type="button" inherit c="inherit" ta="left" onClick={() => setOpenPosition(next.position)}>
                    {next.name}
                  </Anchor>
                </Title>
                <ServingsControl position={next.position} servings={next.servings} />
              </Stack>
              <Group gap="xs">
                <MoveButtons position={next.position} first last={upcoming.length === 0} />
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="position" value={next.position} />
                  <Button type="submit" variant="subtle" color="gray" size="xs" px={6}>
                    <IconX size={14} />
                  </Button>
                </Form>
                <Button
                  component={Link}
                  to={`/cook/${next.id}?position=${next.position}`}
                  color="green"
                  leftSection={<IconPlayerPlay size={16} />}
                >
                  Cook
                </Button>
              </Group>
            </Group>
          </Card>

          {upcoming.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={500} c="dimmed">Upcoming</Text>
              {upcoming.map((meal, i) => (
                <Card key={meal.position} withBorder radius="md" p="md">
                  <Group justify="space-between">
                    <Stack gap={0}>
                      <Anchor component="button" type="button" c="inherit" ta="left" onClick={() => setOpenPosition(meal.position)}>
                        {meal.name}
                      </Anchor>
                      <ServingsControl position={meal.position} servings={meal.servings} />
                    </Stack>
                    <Group gap="xs">
                      <Badge variant="outline" color="gray">#{i + 2}</Badge>
                      <MoveButtons position={meal.position} first={false} last={i === upcoming.length - 1} />
                      <Button
                        component={Link}
                        to={`/cook/${meal.id}?position=${meal.position}`}
                        variant="subtle"
                        color="green"
                        size="xs"
                        px={6}
                        aria-label={`Cook ${meal.name}`}
                      >
                        <IconPlayerPlay size={14} />
                      </Button>
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="position" value={meal.position} />
                        <Button type="submit" variant="subtle" color="gray" size="xs" px={6}>
                          <IconX size={14} />
                        </Button>
                      </Form>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <RecipeDrawer recipe={open} onClose={() => setOpenPosition(null)} />

      <Divider mb="lg" />

      <Stack gap="md">
        {allRecipes.length > 0 && (
          <NumberInput
            label="Servings"
            description="For meals added below; empty uses each recipe's own"
            placeholder="Recipe's"
            min={1}
            allowDecimal={false}
            value={newServings}
            onChange={setNewServings}
            leftSection={<IconUsers size={16} />}
            maw={260}
          />
        )}

        {availableRecipes.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="servings" value={newServings} />
            <Group align="flex-end">
              <Select
                name="recipeId"
                label="Add to schedule"
                data={availableRecipes}
                searchable
                placeholder="Pick a recipe…"
                style={{ flex: 1 }}
              />
              <Button type="submit" leftSection={<IconPlus size={16} />}>Add</Button>
            </Group>
          </Form>
        )}

        {allRecipes.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="auto-fill" />
            <input type="hidden" name="servings" value={newServings} />
            <Group align="flex-end">
              <NumberInput
                name="count"
                label="Auto-fill"
                description="Appends least recently cooked recipes"
                min={1}
                max={MAX_AUTO_FILL}
                allowDecimal={false}
                defaultValue={3}
                style={{ width: 100 }}
              />
              <Button type="submit" variant="light" leftSection={<IconRefresh size={16} />}>
                Auto-fill
              </Button>
            </Group>
          </Form>
        )}
      </Stack>

      <Divider my="lg" />

      <Title order={4} mb="sm">Recently cooked</Title>
      {recentlyCooked.length === 0 ? (
        <Text size="sm" c="dimmed">Nothing cooked yet.</Text>
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
                  <Form method="post">
                    <input type="hidden" name="intent" value="remove-history" />
                    <input type="hidden" name="id" value={entry.id} />
                    <ActionIcon type="submit" variant="subtle" color="gray" aria-label={`Remove ${entry.name} on ${entry.cookedAt} from history`}>
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
