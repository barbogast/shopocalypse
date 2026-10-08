import { Button, Container, Divider, Group, Select, Stack, Text, Title } from "@mantine/core";
import { asc, eq, ne } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemFields } from "~/components/item-fields";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { listShelves, mergeItem, parseItemForm } from "~/db/items.server";
import { items, stores } from "~/db/schema";
import { int } from "~/forms";
import type { Route } from "./+types/items.$id";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.item.name ?? "Item"} – Shopocalypse` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) throw new Response("Not found", { status: 404 });

  const allStores = await db.select().from(stores).orderBy(stores.name);

  const otherItems = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(ne(items.id, id))
    .orderBy(asc(items.name));

  return { item, allShelves: await listShelves(), allStores, otherItems };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();

  if (form.get("intent") === "merge") {
    const keepId = int(form, "keepId");
    if (!keepId) return { mergeError: "Pick an item to merge into." };
    const merged = await mergeItem(id, keepId);
    if (merged.error) return { mergeError: merged.error };
    return redirect("/items");
  }

  const parsed = await parseItemForm(form, id);
  if (parsed.error) return { error: parsed.error };

  await db.update(items).set(parsed.values).where(eq(items.id, id));
  return redirect("/items");
}

export default function EditItem({ loaderData, actionData }: Route.ComponentProps) {
  const { item, allShelves, allStores, otherItems } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Edit item</Title>
      <Form method="post">
        <Stack>
          <ItemFields stores={allStores} shelves={allShelves} defaults={item} />
          <FormError error={actionData && "error" in actionData ? actionData.error : null} />
          <Group>
            <SubmitButton>Save</SubmitButton>
            <Button component={Link} to="/items" variant="subtle">Cancel</Button>
          </Group>
        </Stack>
      </Form>

      <Divider my="xl" />

      <Title order={4} mb="xs">Merge into another item</Title>
      <Text size="sm" c="dimmed" mb="md">
        For a duplicate: recipes and shopping lists switch to the chosen item, and {item.name} is deleted.
      </Text>
      <Form
        method="post"
        onSubmit={(e) => {
          if (!confirm(`Merge ${item.name} into the chosen item? This can't be undone.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="merge" />
        <Stack>
          <Select
            name="keepId"
            label="Keep"
            data={otherItems.map((i) => ({ value: String(i.id), label: i.name }))}
            searchable
            required
            placeholder="Select item…"
          />
          <FormError error={actionData && "mergeError" in actionData ? actionData.mergeError : null} />
          <Group>
            <SubmitButton variant="light" color="red">Merge</SubmitButton>
          </Group>
        </Stack>
      </Form>
    </Container>
  );
}
