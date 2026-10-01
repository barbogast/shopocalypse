import { Button, Container, Group, Stack, Title } from "@mantine/core";
import { eq } from "drizzle-orm";
import { redirect } from "react-router";
import { ItemFields } from "~/components/item-fields";
import { db } from "~/db/client";
import { listShelves, parseItemForm } from "~/db/items.server";
import { items, stores } from "~/db/schema";
import type { Route } from "./+types/items.$id";

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) throw new Response("Not found", { status: 404 });

  const allStores = await db.select().from(stores).orderBy(stores.name);

  return { item, allShelves: listShelves(), allStores };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();

  const parsed = parseItemForm(form, id);
  if (parsed.error) return { error: parsed.error };

  await db.update(items).set(parsed.values).where(eq(items.id, id));
  return redirect("/items");
}

export default function EditItem({ loaderData, actionData }: Route.ComponentProps) {
  const { item, allShelves, allStores } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Edit item</Title>
      <form method="post">
        <Stack>
          <ItemFields stores={allStores} shelves={allShelves} defaults={item} />
          {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
          <Group>
            <Button type="submit">Save</Button>
            <Button component="a" href="/items" variant="subtle">Cancel</Button>
          </Group>
        </Stack>
      </form>
    </Container>
  );
}
