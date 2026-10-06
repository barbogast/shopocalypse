import { Button, Container, Group, Stack, Title } from "@mantine/core";
import { eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemFields } from "~/components/item-fields";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { listShelves, parseItemForm } from "~/db/items.server";
import { items, stores } from "~/db/schema";
import type { Route } from "./+types/items.$id";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.item.name ?? "Item"} – Shopocalypse` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) throw new Response("Not found", { status: 404 });

  const allStores = await db.select().from(stores).orderBy(stores.name);

  return { item, allShelves: await listShelves(), allStores };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();

  const parsed = await parseItemForm(form, id);
  if (parsed.error) return { error: parsed.error };

  await db.update(items).set(parsed.values).where(eq(items.id, id));
  return redirect("/items");
}

export default function EditItem({ loaderData, actionData }: Route.ComponentProps) {
  const { item, allShelves, allStores } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Edit item</Title>
      <Form method="post">
        <Stack>
          <ItemFields stores={allStores} shelves={allShelves} defaults={item} />
          <FormError error={actionData?.error} />
          <Group>
            <SubmitButton>Save</SubmitButton>
            <Button component={Link} to="/items" variant="subtle">Cancel</Button>
          </Group>
        </Stack>
      </Form>
    </Container>
  );
}
