import { Badge, Box, Button, Container, Group, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { and, eq } from "drizzle-orm";
import { useEffect, useRef } from "react";
import { Form, Link, redirect, useLocation, useNavigate } from "react-router";
import { IngredientName } from "~/components/ingredient-name";
import { Markdown } from "~/components/markdown";
import { SubmitButton } from "~/components/submit-button";
import { Weblink } from "~/components/weblink";
import { isDateString, localDate } from "~/dates";
import { db } from "~/db/client";
import { withIngredients } from "~/db/recipes.server";
import { mealHistory, mealSchedule, recipes } from "~/db/schema";
import { optionalText } from "~/forms";
import { formatAmount } from "~/units";
import type { Route } from "./+types/cook.$id";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Cooking ${data?.recipe.name ?? ""} – Shopocalypse` }];
}

// Returns the schedule entry from ?position=, if it refers to an entry for this recipe
async function scheduledMeal(request: Request, recipeId: number) {
  const param = new URL(request.url).searchParams.get("position");
  if (param == null) return null;
  const entry = await db
    .select()
    .from(mealSchedule)
    .where(and(eq(mealSchedule.position, Number(param)), eq(mealSchedule.recipeId, recipeId)))
    .get();
  return entry ?? null;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!recipe) throw new Response("Not found", { status: 404 });

  const meal = await scheduledMeal(request, id);
  // A stale link (meal already cooked or removed): cook it as a one-off instead
  if (!meal && new URL(request.url).searchParams.has("position")) return redirect(`/cook/${id}`);
  const servings = meal?.servings ?? recipe.servingSize;
  const [{ ingredients }] = await withIngredients([{ ...recipe, servings }]);
  return { recipe, servings, ingredients, scheduled: meal != null };
}

export async function action({ params, request }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const comments = optionalText(form, "comments");
  // The browser sends its local date; the server's time zone may differ
  const cookedOn = form.get("cookedOn");
  const cookedAt = isDateString(cookedOn) ? cookedOn : localDate();
  const position = (await scheduledMeal(request, id))?.position ?? null;
  // The loader drops stale positions, so a missing one means this is a repeated
  // submit after the meal was already recorded
  if (position == null && new URL(request.url).searchParams.has("position")) return redirect("/");

  await db.transaction(async (tx) => {
    await tx.update(recipes).set({ comments }).where(eq(recipes.id, id)).run();
    if (position != null) await tx.delete(mealSchedule).where(eq(mealSchedule.position, position)).run();
    await tx.insert(mealHistory).values({ recipeId: id, cookedAt }).run();
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
  const { recipe, servings, ingredients, scheduled } = loaderData;
  const navigate = useNavigate();
  // "default" means this is the first page of the visit (opened from a link or bookmark)
  const cameFromApp = useLocation().key !== "default";
  const cookedOnRef = useRef<HTMLInputElement>(null);
  useWakeLock();

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" align="baseline" mb="lg">
        <Title>{recipe.name}</Title>
        <Group gap="xs">
          <Badge variant="light" color={servings === recipe.servingSize ? "gray" : "blue"}>serves {servings}</Badge>
          <Button component={Link} to={`/recipes/${recipe.id}`} variant="subtle" size="xs"
            leftSection={<IconPencil size={14} />}>
            Edit
          </Button>
        </Group>
      </Group>
      {recipe.weblink && <Weblink href={recipe.weblink} display="block" mt="-sm" mb="lg" />}

      <Title order={3} mb="sm">Ingredients</Title>
      <Table mb="xl" fz="lg">
        <Table.Tbody>
          {ingredients.map((ing) => (
            <Table.Tr key={ing.itemId}>
              <Table.Td><IngredientName {...ing} /></Table.Td>
              <Table.Td c="dimmed" style={{ width: 100 }}>{formatAmount(ing)}</Table.Td>
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
      {recipe.instructions ? (
        <Box fz="lg" mb="xl">
          <Markdown>{recipe.instructions}</Markdown>
        </Box>
      ) : (
        <Text size="lg" mb="xl" c="dimmed">No instructions.</Text>
      )}

      {/* Read at submit time: the page may stay open past midnight */}
      <Form method="post" onSubmit={() => cookedOnRef.current && (cookedOnRef.current.value = localDate())}>
        <input type="hidden" name="cookedOn" ref={cookedOnRef} />
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
            <SubmitButton color="green" leftSection={<IconCheck size={16} />}>
              Done cooking
            </SubmitButton>
            <Button variant="subtle" color="gray" onClick={() => (cameFromApp ? navigate(-1) : navigate("/"))}>
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
