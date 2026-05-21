import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { asc, eq } from "drizzle-orm";
import { Form } from "react-router";
import { db } from "~/db/client";
import { mealHistory, mealSchedule, recipes } from "~/db/schema";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Shopocalypse" }];
}

export async function loader() {
  const scheduled = await db
    .select({ position: mealSchedule.position, name: recipes.name })
    .from(mealSchedule)
    .innerJoin(recipes, eq(mealSchedule.recipeId, recipes.id))
    .orderBy(asc(mealSchedule.position));
  return { scheduled };
}

export async function action({ request }: Route.ActionArgs) {
  const head = await db
    .select()
    .from(mealSchedule)
    .orderBy(asc(mealSchedule.position))
    .limit(1);

  if (head.length === 0) return null;

  const { position, recipeId } = head[0];

  await db.delete(mealSchedule).where(eq(mealSchedule.position, position));
  await db.insert(mealHistory).values({
    recipeId,
    cookedAt: new Date().toISOString().slice(0, 10),
  });

  return null;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { scheduled } = loaderData;
  const [next, ...upcoming] = scheduled;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Meal schedule</Title>

      {!next ? (
        <Text c="dimmed">No meals scheduled.</Text>
      ) : (
        <Stack>
          <Card withBorder shadow="sm" radius="md" p="lg">
            <Group justify="space-between" align="center">
              <Stack gap={4}>
                <Badge color="green" variant="light">Next up</Badge>
                <Title order={2}>{next.name}</Title>
              </Stack>
              <Form method="post">
                <Button type="submit" color="green">
                  Cook
                </Button>
              </Form>
            </Group>
          </Card>

          {upcoming.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={500} c="dimmed">Upcoming</Text>
              {upcoming.map((meal, i) => (
                <Card key={meal.position} withBorder radius="md" p="md">
                  <Group justify="space-between">
                    <Text>{meal.name}</Text>
                    <Badge variant="outline" color="gray">#{i + 2}</Badge>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Container>
  );
}
