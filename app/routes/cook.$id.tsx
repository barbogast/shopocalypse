import { Badge, Button, Container, Group, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { and, asc, eq } from "drizzle-orm";
import { useEffect } from "react";
import { Form, Link, redirect, useNavigate } from "react-router";
import { db } from "~/db/client";
import { items, mealHistory, mealSchedule, recipeIngredients, recipes } from "~/db/schema";
import type { Route } from "./+types/cook.$id";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Cooking ${data?.recipe.name ?? ""} – Shopocalypse` }];
}

// Returns the schedule position from ?position=, if it refers to an entry for this recipe
function scheduledPosition(request: Request, recipeId: number) {
  const param = new URL(request.url).searchParams.get("position");
  if (param == null) return null;
  const entry = db
    .select()
    .from(mealSchedule)
    .where(and(eq(mealSchedule.position, Number(param)), eq(mealSchedule.recipeId, recipeId)))
    .get();
  return entry?.position ?? null;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!recipe) throw new Response("Not found", { status: 404 });

  const ingredients = await db
    .select({ itemId: items.id, name: items.name, quantity: recipeIngredients.quantity })
    .from(recipeIngredients)
    .innerJoin(items, eq(recipeIngredients.itemId, items.id))
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(items.name));

  return { recipe, ingredients, scheduled: scheduledPosition(request, id) != null };
}

export async function action({ params, request }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const comments = String(form.get("comments") ?? "").trim() || null;
  const position = scheduledPosition(request, id);

  db.transaction((tx) => {
    tx.update(recipes).set({ comments }).where(eq(recipes.id, id)).run();
    if (position != null) tx.delete(mealSchedule).where(eq(mealSchedule.position, position)).run();
    tx.insert(mealHistory).values({ recipeId: id, cookedAt: new Date().toISOString().slice(0, 10) }).run();
  });

  return redirect(position != null ? "/" : `/recipes/${id}`);
}

// Keep the screen on while cooking. Browsers drop the lock when the tab is
// hidden, so re-acquire it when the page becomes visible again.
function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}

export default function Cook({ loaderData }: Route.ComponentProps) {
  const { recipe, ingredients, scheduled } = loaderData;
  const navigate = useNavigate();
  useWakeLock();

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" align="baseline" mb="lg">
        <Title>{recipe.name}</Title>
        <Group gap="xs">
          <Badge variant="light" color="gray">serves {recipe.servingSize}</Badge>
          <Button component={Link} to={`/recipes/${recipe.id}`} variant="subtle" size="xs"
            leftSection={<IconPencil size={14} />}>
            Edit
          </Button>
        </Group>
      </Group>

      <Title order={3} mb="sm">Ingredients</Title>
      <Table mb="xl" fz="lg">
        <Table.Tbody>
          {ingredients.map((ing) => (
            <Table.Tr key={ing.itemId}>
              <Table.Td>{ing.name}</Table.Td>
              <Table.Td c="dimmed" style={{ width: 60 }}>{ing.quantity}×</Table.Td>
            </Table.Tr>
          ))}
          {ingredients.length === 0 && (
            <Table.Tr>
              <Table.Td c="dimmed">No ingredients.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Title order={3} mb="sm">Instructions</Title>
      <Text size="lg" mb="xl" style={{ whiteSpace: "pre-wrap" }} c={recipe.instructions ? undefined : "dimmed"}>
        {recipe.instructions ?? "No instructions."}
      </Text>

      <Form method="post">
        <Stack>
          <Textarea
            name="comments"
            label="Comments"
            description="Saved when you finish cooking"
            defaultValue={recipe.comments ?? ""}
            autosize
            minRows={2}
          />
          <Group>
            <Button type="submit" color="green" leftSection={<IconCheck size={16} />}>
              Done cooking
            </Button>
            <Button variant="subtle" color="gray" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </Group>
          {!scheduled && (
            <Text size="xs" c="dimmed">Not from the schedule: finishing records it as cooked, the schedule stays unchanged.</Text>
          )}
        </Stack>
      </Form>
    </Container>
  );
}
