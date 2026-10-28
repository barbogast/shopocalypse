import { Badge, Box, Button, Container, Group, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { and, eq } from "drizzle-orm";
import { useEffect, useRef } from "react";
import { Form, Link, redirect, useLocation, useNavigate } from "react-router";
import { CookTimers, remarkTimers, timerComponents } from "~/components/cook-timers";
import { IngredientName } from "~/components/ingredient-name";
import { Markdown } from "~/components/markdown";
import { SubmitButton } from "~/components/submit-button";
import { ThawWarning } from "~/components/thaw-warning";
import { Weblink } from "~/components/weblink";
import { isDateString, localDate } from "~/dates";
import { db } from "~/db/client";
import { recordRecipeVersion } from "~/db/recipe-versions";
import { withIngredients } from "~/db/recipes.server";
import * as schema from "~/db/schema";
import { optionalText } from "~/forms";
import { formatAmount } from "~/units";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/cook.$id";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: pageTitle(`Kochen: ${data?.recipe.name ?? ""}`) }];
}

// Returns the schedule entry from ?position=, if it refers to an entry for this recipe
async function scheduledMeal(request: Request, recipeId: number) {
  const param = new URL(request.url).searchParams.get("position");
  if (param == null) return null;
  const entry = await db
    .select()
    .from(schema.mealSchedule)
    .where(and(eq(schema.mealSchedule.position, Number(param)), eq(schema.mealSchedule.recipeId, recipeId)))
    .get();
  return entry ?? null;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, id));
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
    await tx.update(schema.recipes).set({ comments }).where(eq(schema.recipes.id, id)).run();
    if (position != null) await tx.delete(schema.mealSchedule).where(eq(schema.mealSchedule.position, position)).run();
    await tx.insert(schema.mealHistory).values({ recipeId: id, cookedAt }).run();
    await recordRecipeVersion(tx, id);
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
    <CookTimers recipeId={recipe.id}>
    {/* The bottom padding keeps the timer button clear of the form */}
    <Container size="sm" pt="xl" pb={100}>
      <Group justify="space-between" align="baseline" mb="lg">
        <Title>{recipe.name}</Title>
        <Group gap="xs">
          <Badge variant="light" color={servings === recipe.servingSize ? "gray" : "blue"}>für {servings}</Badge>
          <Button component={Link} to={`/recipes/${recipe.id}`} variant="subtle" size="xs"
            leftSection={<IconPencil size={14} />}>
            Bearbeiten
          </Button>
        </Group>
      </Group>
      {recipe.weblink && <Weblink href={recipe.weblink} display="block" mt="-sm" mb="lg" />}

      <ThawWarning ingredients={ingredients} mb="md" />

      <Title order={3} mb="sm">Zutaten</Title>
      <Table mb="xl" fz="lg">
        <Table.Tbody>
          {ingredients.map((ing) => (
            <Table.Tr key={ing.itemId}>
              <Table.Td c="dimmed" ta="right" style={{ width: 100, verticalAlign: "top" }}>{formatAmount(ing)}</Table.Td>
              <Table.Td><IngredientName {...ing} /></Table.Td>
            </Table.Tr>
          ))}
          {ingredients.length === 0 && (
            <Table.Tr>
              <Table.Td c="dimmed">Keine Zutaten.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Title order={3} mb="sm">Zubereitung</Title>
      {recipe.instructions ? (
        <Box fz="lg" mb="xl">
          <Markdown remarkPlugins={[remarkTimers]} components={timerComponents}>{recipe.instructions}</Markdown>
        </Box>
      ) : (
        <Text size="lg" mb="xl" c="dimmed">Keine Zubereitung.</Text>
      )}

      {/* Read at submit time: the page may stay open past midnight */}
      <Form method="post" onSubmit={() => cookedOnRef.current && (cookedOnRef.current.value = localDate())}>
        <input type="hidden" name="cookedOn" ref={cookedOnRef} />
        <Stack>
          <Textarea
            name="comments"
            label="Anmerkungen"
            description="Werden beim Abschließen gespeichert"
            defaultValue={recipe.comments ?? ""}
            autosize
            minRows={2}
          />
          <Group>
            <SubmitButton color="green" leftSection={<IconCheck size={16} />}>
              Fertig gekocht
            </SubmitButton>
            <Button variant="subtle" color="gray" onClick={() => (cameFromApp ? navigate(-1) : navigate("/"))}>
              Abbrechen
            </Button>
          </Group>
          {!scheduled && (
            <Text size="xs" c="dimmed">Nicht aus dem Speiseplan: Wird als gekocht eingetragen, der Speiseplan bleibt unverändert.</Text>
          )}
        </Stack>
      </Form>
    </Container>
    </CookTimers>
  );
}
