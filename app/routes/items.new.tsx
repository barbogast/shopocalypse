import { Button, Container, Group, Select, Stack, TextInput, Title } from "@mantine/core";
import { redirect } from "react-router";
import { db } from "~/db/client";
import { itemCategories, items, stores } from "~/db/schema";
import type { Route } from "./+types/items.new";

export function meta() {
  return [{ title: "New Item – Shopocalypse" }];
}

export async function loader() {
  const allCategories = await db.select().from(itemCategories).orderBy(itemCategories.name);
  const allStores = await db.select().from(stores).orderBy(stores.name);
  return { allCategories, allStores };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = String(form.get("name")).trim();
  const categoryId = form.get("categoryId") ? Number(form.get("categoryId")) : null;
  const storeId = form.get("storeId") ? Number(form.get("storeId")) : null;

  if (!name) return { error: "Name is required." };

  await db.insert(items).values({ name, categoryId, storeId });
  return redirect("/items");
}

export default function NewItem({ loaderData, actionData }: Route.ComponentProps) {
  const { allCategories, allStores } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">New item</Title>
      <form method="post">
        <Stack>
          <TextInput name="name" label="Name" required autoFocus />
          <Select
            name="categoryId"
            label="Category"
            data={allCategories.map((c) => ({ value: String(c.id), label: c.name }))}
            clearable
            placeholder="None"
          />
          <Select
            name="storeId"
            label="Store"
            data={allStores.map((s) => ({ value: String(s.id), label: s.name }))}
            clearable
            placeholder="None"
          />
          {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
          <Group>
            <Button type="submit">Create</Button>
            <Button component="a" href="/items" variant="subtle">Cancel</Button>
          </Group>
        </Stack>
      </form>
    </Container>
  );
}
