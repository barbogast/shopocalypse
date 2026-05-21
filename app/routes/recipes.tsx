import { ActionIcon, Button, Container, Group, Stack, Table, Title } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { db } from "~/db/client";
import { recipes } from "~/db/schema";
import type { Route } from "./+types/recipes";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Recipes – Shopocalypse" }];
}

export async function loader() {
  const all = await db.select().from(recipes).orderBy(recipes.name);
  return { recipes: all };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = Number(form.get("id"));
  await db.delete(recipes).where(eq(recipes.id, id));
  return null;
}

export default function Recipes({ loaderData }: Route.ComponentProps) {
  const { recipes: all } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="lg">
        <Title>Recipes</Title>
        <Button component={Link} to="/recipes/new" leftSection={<IconPlus size={16} />}>
          New
        </Button>
      </Group>

      <Table highlightOnHover>
        <Table.Tbody>
          {all.map((recipe) => (
            <Table.Tr key={recipe.id}>
              <Table.Td>
                <Link to={`/recipes/${recipe.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  {recipe.name}
                </Link>
              </Table.Td>
              <Table.Td c="dimmed" style={{ width: 80 }}>
                serves {recipe.servingSize}
              </Table.Td>
              <Table.Td style={{ width: 40 }}>
                <Form method="post">
                  <input type="hidden" name="id" value={recipe.id} />
                  <ActionIcon variant="subtle" color="red" type="submit">
                    <IconTrash size={16} />
                  </ActionIcon>
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
