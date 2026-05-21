import { Button, Container, Group, Select, Stack, TextInput, Title } from "@mantine/core";
import { eq } from "drizzle-orm";
import { redirect } from "react-router";
import { db } from "~/db/client";
import { itemCategories, items, stores } from "~/db/schema";
import type { Route } from "./+types/items.$id";

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) throw new Response("Not found", { status: 404 });

  const allCategories = await db.select().from(itemCategories).orderBy(itemCategories.name);
  const allStores = await db.select().from(stores).orderBy(stores.name);

  return { item, allCategories, allStores };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();

  const name = String(form.get("name")).trim();
  const categoryId = form.get("categoryId") ? Number(form.get("categoryId")) : null;
  const storeId = form.get("storeId") ? Number(form.get("storeId")) : null;

  if (!name) return { error: "Name is required." };

  await db.update(items).set({ name, categoryId, storeId }).where(eq(items.id, id));
  return redirect("/items");
}

export default function EditItem({ loaderData, actionData }: Route.ComponentProps) {
  const { item, allCategories, allStores } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Edit item</Title>
      <form method="post">
        <Stack>
          <TextInput name="name" label="Name" defaultValue={item.name} required />
          <Select
            name="categoryId"
            label="Category"
            data={allCategories.map((c) => ({ value: String(c.id), label: c.name }))}
            defaultValue={item.categoryId ? String(item.categoryId) : null}
            clearable
            placeholder="None"
          />
          <Select
            name="storeId"
            label="Store"
            data={allStores.map((s) => ({ value: String(s.id), label: s.name }))}
            defaultValue={item.storeId ? String(item.storeId) : null}
            clearable
            placeholder="None"
          />
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
