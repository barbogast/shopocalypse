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
import { IconPlayerPlay, IconPlus, IconRefresh, IconTrash, IconUsers, IconX } from "@tabler/icons-react";
import { asc, desc, eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { Form, Link } from "react-router";
import { FormError } from "~/components/form-error";
import { MoveButtons } from "~/components/move-buttons";
import { ServingsControl } from "~/components/servings";
import { RecipeDrawer } from "~/components/recipe-drawer";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { formatCookedAt, mealServings, withIngredients } from "~/db/recipes.server";
import { autoFill, moveScheduledMeal, scheduleRecipe } from "~/db/schedule.server";
import * as schema from "~/db/schema";
import { confirmFirst, int, text } from "~/forms";
import { pageTitle } from "~/page-title";
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
      instructions: schema.recipes.instructions,
      comments: schema.recipes.comments,
      weblink: schema.recipes.weblink,
    })
    .from(schema.mealSchedule)
    .innerJoin(schema.recipes, eq(schema.mealSchedule.recipeId, schema.recipes.id))
    .orderBy(asc(schema.mealSchedule.position))
    .then(withIngredients);

  const allRecipes = await db
    .select({ id: schema.recipes.id, name: schema.recipes.name })
    .from(schema.recipes)
    .where(eq(schema.recipes.archived, false))
    .orderBy(schema.recipes.name);

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
    case "move": {
      if (position) await moveScheduledMeal(position, form.get("direction") === "up");
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
      const { error } = await autoFill(count, newServings);
      if (error) return { autoFillError: error };
      break;
    }
    default:
      throw new Response("Unknown intent", { status: 400 });
  }

  return null;
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { scheduled, allRecipes, recentlyCooked } = loaderData;
  const [next, ...upcoming] = scheduled;

  const availableRecipes = allRecipes.map((r) => ({ value: String(r.id), label: r.name }));
  // Shared by the add and auto-fill forms
  const [newServings, setNewServings] = useState<string | number>(4);
  // The add form's recipe, cleared once it's added but kept when adding fails
  const [addRecipeId, setAddRecipeId] = useState<string | null>(null);
  useEffect(() => {
    if (actionData && "added" in actionData) setAddRecipeId(null);
  }, [actionData]);
  // Tapping a meal's name opens its recipe details
  const [openPosition, setOpenPosition] = useState<number | null>(null);
  const open = scheduled.find((m) => m.position === openPosition);

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Speiseplan</Title>

      {!next ? (
        <Text c="dimmed" mb="xl">Keine Mahlzeiten geplant.</Text>
      ) : (
        <Stack mb="xl">
          <Card withBorder shadow="sm" radius="md" p="lg">
            <Group justify="space-between" align="center">
              <Stack gap={4}>
                <Badge color="green" variant="light">Als Nächstes</Badge>
                <Title order={2}>
                  <Anchor component="button" type="button" inherit c="inherit" ta="left" onClick={() => setOpenPosition(next.position)}>
                    {next.name}
                  </Anchor>
                </Title>
                <ServingsControl position={next.position} servings={next.servings} />
              </Stack>
              <Group gap="xs">
                <MoveButtons intent="move" fields={{ position: next.position }} first last={upcoming.length === 0} />
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="position" value={next.position} />
                  <Button type="submit" variant="subtle" color="gray" size="xs" px={6} aria-label={`${next.name} aus dem Speiseplan entfernen`}>
                    <IconX size={14} />
                  </Button>
                </Form>
                <Button
                  component={Link}
                  to={`/cook/${next.id}?position=${next.position}`}
                  color="green"
                  leftSection={<IconPlayerPlay size={16} />}
                >
                  Kochen
                </Button>
              </Group>
            </Group>
          </Card>

          {upcoming.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={500} c="dimmed">Danach</Text>
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
                      <MoveButtons intent="move" fields={{ position: meal.position }} first={false} last={i === upcoming.length - 1} />
                      <Button
                        component={Link}
                        to={`/cook/${meal.id}?position=${meal.position}`}
                        variant="subtle"
                        color="green"
                        size="xs"
                        px={6}
                        aria-label={`${meal.name} kochen`}
                      >
                        <IconPlayerPlay size={14} />
                      </Button>
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="position" value={meal.position} />
                        <Button type="submit" variant="subtle" color="gray" size="xs" px={6} aria-label={`${meal.name} aus dem Speiseplan entfernen`}>
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

        {availableRecipes.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="servings" value={newServings} />
            <Group align="flex-end">
              <Select
                name="recipeId"
                label="Zum Speiseplan hinzufügen"
                data={availableRecipes}
                value={addRecipeId}
                onChange={setAddRecipeId}
                searchable
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
