import { Button, Container, Group, Stack, Title } from "@mantine/core";
import { Form, Link, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemFields } from "~/components/item-fields";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { listShelves, parseItemForm } from "~/db/items.server";
import { items, stores } from "~/db/schema";
import type { Route } from "./+types/items.new";

export function meta() {
  return [{ title: "New Item – Shopocalypse" }];
}

export async function loader() {
  const allStores = await db.select().from(stores).orderBy(stores.name);
  return { allShelves: await listShelves(), allStores };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = await parseItemForm(form);
  if (parsed.error) return { error: parsed.error };

  await db.insert(items).values(parsed.values);
  return redirect("/items");
}

export default function NewItem({ loaderData, actionData }: Route.ComponentProps) {
  const { allShelves, allStores } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">New item</Title>
      <Form method="post">
        <Stack>
          <ItemFields stores={allStores} shelves={allShelves} autoFocus />
          <FormError error={actionData?.error} />
          <Group>
            <SubmitButton>Create</SubmitButton>
            <Button component={Link} to="/items" variant="subtle">Cancel</Button>
          </Group>
        </Stack>
      </Form>
    </Container>
  );
}
