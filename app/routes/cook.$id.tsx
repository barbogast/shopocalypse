import { Box, Button, Container, Group, Image, Radio, Stack, Table, Text, Textarea, TextInput, Title } from "@mantine/core";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { and, eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { Form, Link, redirect, useLocation, useNavigate } from "react-router";
import { CookTimers, remarkTimers, timerComponents } from "~/components/cook-timers";
import { IngredientName } from "~/components/ingredient-name";
import { Markdown } from "~/components/markdown";
import { ServingsStepper } from "~/components/servings";
import { SubmitButton } from "~/components/submit-button";
import { TagBadge } from "~/components/tag-badge";
import { ThawWarning } from "~/components/thaw-warning";
import { Weblink } from "~/components/weblink";
import { daysBefore, isDateString, localDate, weekdayName } from "~/dates";
import { db } from "~/db/client";
import { recipePhotoUrl } from "~/db/recipe-photos.server";
import { recordRecipeVersion } from "~/db/recipe-versions";
import { withIngredients } from "~/db/recipes.server";
import * as schema from "~/db/schema";
import { tagsByRecipe } from "~/db/tags.server";
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
  // ?servings= only rescales this page: the meal is about to be cooked, so the
  // schedule and shopping list stay as they are. In the URL, it survives a reload.
  const chosen = Number(new URL(request.url).searchParams.get("servings"));
  const servings = Number.isInteger(chosen) && chosen >= 1 ? chosen : meal?.servings ?? recipe.servingSize;
  const [{ ingredients }] = await withIngredients([{ ...recipe, servings }]);
  const tags = (await tagsByRecipe([id])).get(id) ?? [];
  return { recipe, servings, ingredients, tags, position: meal?.position ?? null, photoUrl: await recipePhotoUrl(id) };
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

// The browser's local date, empty until hydrated since the server's time zone may differ.
// Keeps up when the page stays open past midnight.
function useToday() {
  const [today, setToday] = useState("");
  useEffect(() => {
    const update = () => setToday(localDate());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

const OTHER_DAY = "other";

export default function Cook({ loaderData }: Route.ComponentProps) {
  const { recipe, servings, ingredients, tags, position, photoUrl } = loaderData;
  const navigate = useNavigate();
  // "default" means this is the first page of the visit (opened from a link or bookmark)
  const cameFromApp = useLocation().key !== "default";
  const today = useToday();
  // How many days ago the meal was cooked, or OTHER_DAY for the date field
  const [cookedDay, setCookedDay] = useState("0");
  const [otherDate, setOtherDate] = useState("");
  const cookedOn = cookedDay === OTHER_DAY ? otherDate : today && daysBefore(today, Number(cookedDay));
  const dayOptions = [
    { value: "0", label: "Heute" },
    { value: "1", label: "Gestern" },
    ...(today ? [2, 3].map((days) => ({ value: String(days), label: weekdayName(daysBefore(today, days)) })) : []),
    { value: OTHER_DAY, label: "Anderes Datum" },
  ];
  useWakeLock();

  return (
    <CookTimers recipeId={recipe.id}>
    <Container size="sm" pt="xl">
      <Group justify="space-between" align="baseline" mb="lg">
        <Title>{recipe.name}</Title>
        <Button component={Link} to={`/recipes/${recipe.id}`} variant="light"
          leftSection={<IconPencil size={16} />}>
          Bearbeiten
        </Button>
      </Group>
      {(recipe.weblink || tags.length > 0) && (
        <Group gap="xs" mt="-sm" mb="lg">
          {recipe.weblink && <Weblink href={recipe.weblink} />}
          {tags.map((tag) => <TagBadge key={tag.id} {...tag} size="sm" />)}
        </Group>
      )}
      {photoUrl && <Image src={photoUrl} alt="" radius="md" mah={240} fit="cover" mb="lg" />}

      <ThawWarning ingredients={ingredients} mb="md" />

      <Group justify="space-between" align="center" mb="sm">
        <Title order={3}>Zutaten</Title>
        <Group gap="xs">
          {servings !== recipe.servingSize && <Text size="sm" c="dimmed">Rezept für {recipe.servingSize}</Text>}
          <Form replace preventScrollReset style={{ display: "flex", alignItems: "center" }}>
            {position != null && <input type="hidden" name="position" value={position} />}
            <ServingsStepper servings={servings} />
          </Form>
        </Group>
      </Group>
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

      <Form method="post">
        <Stack>
          <Textarea
            name="comments"
            label="Anmerkungen"
            description="Werden beim Abschließen gespeichert"
            defaultValue={recipe.comments ?? ""}
            autosize
            minRows={2}
          />
          {/* The date field only exists for "Anderes Datum", so the date goes in its own input */}
          <input type="hidden" name="cookedOn" value={cookedOn} />
          <Stack gap="xs">
            <Radio.Group
              label="Gekocht am"
              value={cookedDay}
              onChange={(day) => {
                // The field starts from the day chosen so far
                if (day === OTHER_DAY) setOtherDate(cookedOn);
                setCookedDay(day);
              }}
            >
              <Group gap="md" mt="xs">
                {dayOptions.map((option) => <Radio key={option.value} {...option} />)}
              </Group>
            </Radio.Group>
            {cookedDay === OTHER_DAY && (
              <TextInput
                type="date"
                aria-label="Datum"
                value={cookedOn}
                max={today}
                required
                onChange={(e) => setOtherDate(e.currentTarget.value)}
                maw={200}
              />
            )}
          </Stack>
          <Group>
            <SubmitButton color="green" leftSection={<IconCheck size={16} />}>
              Fertig gekocht
            </SubmitButton>
            <Button variant="subtle" color="gray" onClick={() => (cameFromApp ? navigate(-1) : navigate("/"))}>
              Abbrechen
            </Button>
          </Group>
          {position == null && (
            <Text size="xs" c="dimmed">Nicht aus dem Speiseplan: Wird als gekocht eingetragen, der Speiseplan bleibt unverändert.</Text>
          )}
        </Stack>
      </Form>
    </Container>
    </CookTimers>
  );
}
