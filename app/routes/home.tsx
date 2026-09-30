import {
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconPlayerPlay, IconPlus, IconRefresh, IconX } from "@tabler/icons-react";
import { asc, desc, eq, inArray, max, notInArray } from "drizzle-orm";
import { Form, Link } from "react-router";
import { db } from "~/db/client";
import { mealHistory, mealSchedule, recipes } from "~/db/schema";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Shopocalypse" }];
}

export async function loader() {
  const scheduled = await db
    .select({ position: mealSchedule.position, recipeId: mealSchedule.recipeId, name: recipes.name })
    .from(mealSchedule)
    .innerJoin(recipes, eq(mealSchedule.recipeId, recipes.id))
    .orderBy(asc(mealSchedule.position));

  const allRecipes = await db
    .select({ id: recipes.id, name: recipes.name })
    .from(recipes)
    .where(eq(recipes.archived, false))
    .orderBy(recipes.name);

  return { scheduled, allRecipes };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "remove") {
    const position = Number(form.get("position"));
    await db.delete(mealSchedule).where(eq(mealSchedule.position, position));
  }

  if (intent === "add") {
    const recipeId = Number(form.get("recipeId"));
    const [{ nextPos }] = await db
      .select({ nextPos: max(mealSchedule.position) })
      .from(mealSchedule);
    await db.insert(mealSchedule).values({ position: (nextPos ?? 0) + 1, recipeId });
  }

  if (intent === "auto-fill") {
    const count = Number(form.get("count"));

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

    if (rotation.length === 0 || count < 1) return null;

    const [{ nextPos }] = await db
      .select({ nextPos: max(mealSchedule.position) })
      .from(mealSchedule);
    const start = (nextPos ?? 0) + 1;
    // Loop through the rotation if more meals are requested than there are recipes
    await db.insert(mealSchedule).values(
      Array.from({ length: count }, (_, i) => ({
        position: start + i,
        recipeId: rotation[i % rotation.length].id,
      }))
    );
  }

  return null;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { scheduled, allRecipes } = loaderData;
  const [next, ...upcoming] = scheduled;

  const availableRecipes = allRecipes.map((r) => ({ value: String(r.id), label: r.name }));

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
                <Title order={2}>{next.name}</Title>
              </Stack>
              <Group gap="xs">
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="position" value={next.position} />
                  <Button type="submit" variant="subtle" color="gray" size="xs" px={6}>
                    <IconX size={14} />
                  </Button>
                </Form>
                <Button
                  component={Link}
                  to={`/cook/${next.recipeId}?position=${next.position}`}
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
                    <Text>{meal.name}</Text>
                    <Group gap="xs">
                      <Badge variant="outline" color="gray">#{i + 2}</Badge>
                      <Button
                        component={Link}
                        to={`/cook/${meal.recipeId}?position=${meal.position}`}
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

      <Divider mb="lg" />

      <Stack gap="md">
        {availableRecipes.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
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
            <Group align="flex-end">
              <NumberInput
                name="count"
                label="Auto-fill"
                description="Appends least recently cooked recipes"
                min={1}
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
    </Container>
  );
}
