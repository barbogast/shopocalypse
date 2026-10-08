import { ActionIcon, Badge, Button, Container, Group, SegmentedControl, Switch, Table, Text, Title, Tooltip } from "@mantine/core";
import { IconArchive, IconArchiveOff, IconFileImport, IconPlayerPlay, IconPlus, IconTrash } from "@tabler/icons-react";
import { desc, eq } from "drizzle-orm";
import { Form, Link, useSearchParams } from "react-router";
import { db } from "~/db/client";
import { deleteOrArchiveRecipe, restoreRecipe } from "~/db/recipes.server";
import { mealHistory, recipes } from "~/db/schema";
import { int } from "~/forms";
import type { Route } from "./+types/recipes";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Recipes – Shopocalypse" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const showArchived = params.has("archived");
  const all = await db
    .select()
    .from(recipes)
    .where(showArchived ? undefined : eq(recipes.archived, false))
    // Ids count up, so the highest id is the most recently added
    .orderBy(params.get("by") === "added" ? desc(recipes.id) : recipes.name);
  const cooked = await db.selectDistinct({ recipeId: mealHistory.recipeId }).from(mealHistory);
  const cookedIds = new Set(cooked.map((c) => c.recipeId));
  return { recipes: all.map((r) => ({ ...r, cooked: cookedIds.has(r.id) })) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = int(form, "id");
  if (!id) return null;
  switch (form.get("intent")) {
    case "restore":
      await restoreRecipe(id);
      break;
    case "delete":
      await deleteOrArchiveRecipe(id);
      break;
    default:
      throw new Response("Unknown intent", { status: 400 });
  }
  return null;
}

export default function Recipes({ loaderData }: Route.ComponentProps) {
  const { recipes: all } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchived = searchParams.has("archived");
  const byAdded = searchParams.get("by") === "added";
  const setParam = (name: string, value: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null) next.delete(name);
      else next.set(name, value);
      return next;
    }, { replace: true });

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="lg">
        <Group gap="xs" align="baseline">
          <Title>Recipes</Title>
          <Text c="dimmed" size="sm">{all.length}</Text>
        </Group>
        <Group gap="xs">
          <Button component={Link} to="/items" variant="subtle" size="sm">Manage items</Button>
          <Button component={Link} to="/recipes/import" variant="light" leftSection={<IconFileImport size={16} />}>
            Import
          </Button>
          <Button component={Link} to="/recipes/new" leftSection={<IconPlus size={16} />}>
            New
          </Button>
        </Group>
      </Group>

      <Group justify="space-between" mb="md">
        <SegmentedControl
          size="xs"
          data={[{ label: "By name", value: "name" }, { label: "Newest first", value: "added" }]}
          value={byAdded ? "added" : "name"}
          onChange={(by) => setParam("by", by === "added" ? by : null)}
        />
        <Switch
          label="Show archived"
          checked={showArchived}
          onChange={(e) => setParam("archived", e.currentTarget.checked ? "" : null)}
        />
      </Group>

      <Table highlightOnHover>
        <Table.Tbody>
          {all.map((recipe) => (
            <Table.Tr key={recipe.id} style={{ position: "relative" }} opacity={recipe.archived ? 0.6 : 1}>
              <Table.Td>
                <Link to={`/recipes/${recipe.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  {recipe.name}
                  <span aria-hidden="true" style={{ position: "absolute", inset: 0 }} />
                </Link>
                {recipe.archived && (
                  <Badge size="xs" variant="outline" color="gray" ml="xs">archived</Badge>
                )}
              </Table.Td>
              <Table.Td c="dimmed" style={{ width: 80 }}>
                serves {recipe.servingSize}
              </Table.Td>
              <Table.Td style={{ width: 40 }}>
                <Tooltip label="Cook now">
                  <ActionIcon component={Link} to={`/cook/${recipe.id}`} style={{ position: "relative", zIndex: 1 }} variant="subtle" color="green" aria-label={`Cook ${recipe.name}`}>
                    <IconPlayerPlay size={16} />
                  </ActionIcon>
                </Tooltip>
              </Table.Td>
              <Table.Td style={{ width: 40 }}>
                <Form method="post">
                  <input type="hidden" name="id" value={recipe.id} />
                  <input type="hidden" name="intent" value={recipe.archived ? "restore" : "delete"} />
                  {recipe.archived ? (
                    <Tooltip label="Restore from archive">
                      <ActionIcon style={{ position: "relative", zIndex: 1 }} variant="subtle" color="blue" type="submit" aria-label={`Restore ${recipe.name}`}>
                        <IconArchiveOff size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : recipe.cooked ? (
                    <Tooltip label="Archive">
                      <ActionIcon style={{ position: "relative", zIndex: 1 }} variant="subtle" color="gray" type="submit" aria-label={`Archive ${recipe.name}`}>
                        <IconArchive size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <ActionIcon style={{ position: "relative", zIndex: 1 }} variant="subtle" color="red" type="submit" aria-label={`Delete ${recipe.name}`}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
          {all.length === 0 && (
            <Table.Tr>
              <Table.Td c="dimmed">No recipes yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Container>
  );
}
