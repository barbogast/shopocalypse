import { Button, Container, Group, Stack, Title } from "@mantine/core";
import { Form, Link, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemFields } from "~/components/item-fields";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { loadItemFormOptions, parseItemForm } from "~/db/items.server";
import * as schema from "~/db/schema";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/items.new";

export function meta() {
  return [{ title: pageTitle("Neuer Artikel") }];
}

export async function loader() {
  return loadItemFormOptions();
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = await parseItemForm(form);
  if (parsed.error) return { error: parsed.error };

  await db.insert(schema.items).values(parsed.values);
  return redirect("/items");
}

export default function NewItem({ loaderData, actionData }: Route.ComponentProps) {
  const { allShelves, allStores, parents } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Neuer Artikel</Title>
      <Form method="post">
        <Stack>
          <ItemFields stores={allStores} shelves={allShelves} parents={parents} autoFocus />
          <FormError error={actionData?.error} />
          <Group>
            <SubmitButton>Anlegen</SubmitButton>
            <Button component={Link} to="/items" variant="subtle">Abbrechen</Button>
          </Group>
        </Stack>
      </Form>
    </Container>
  );
}
