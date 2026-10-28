import { Button, Container, Divider, Group, Select, Stack, Text, Title } from "@mantine/core";
import { eq, ne, sql } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemFields } from "~/components/item-fields";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { loadItemFormOptions, mergeItem, parseItemForm, updateItem } from "~/db/items.server";
import * as schema from "~/db/schema";
import { confirmFirst, int, itemsPath } from "~/forms";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/items.$id";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: pageTitle(data?.item.name ?? "Artikel") }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [item] = await db.select().from(schema.items).where(eq(schema.items.id, id));
  if (!item) throw new Response("Not found", { status: 404 });

  const otherItems = await db
    .select({ id: schema.items.id, name: schema.items.name })
    .from(schema.items)
    .where(ne(schema.items.id, id))
    .orderBy(sql`${schema.items.name} collate nocase`);

  // An item with variants can't become a variant itself
  const hasVariants = !!(await db.select().from(schema.items).where(eq(schema.items.parentId, id)).limit(1).get());
  const { allStores, allShelves, parents } = await loadItemFormOptions(id);

  // The items view this was opened from, to go back to after saving
  const returnTo = itemsPath(new URL(request.url).searchParams.get("returnTo"));

  return { item, allShelves, allStores, otherItems, parents: hasVariants ? undefined : parents, returnTo };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const returnTo = itemsPath(form.get("returnTo") as string | null);

  if (form.get("intent") === "merge") {
    const keepId = int(form, "keepId");
    if (!keepId) return { mergeError: "Bitte einen Artikel zum Zusammenführen wählen." };
    const merged = await mergeItem(id, keepId);
    if (merged.error) return { mergeError: merged.error };
    return redirect(returnTo);
  }

  const parsed = await parseItemForm(form, id);
  if (parsed.error) return { error: parsed.error };

  await updateItem(id, parsed.values);
  return redirect(returnTo);
}

export default function EditItem({ loaderData, actionData }: Route.ComponentProps) {
  const { item, allShelves, allStores, otherItems, parents, returnTo } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Artikel bearbeiten</Title>
      <Form method="post">
        <input type="hidden" name="returnTo" value={returnTo} />
        <Stack>
          <ItemFields stores={allStores} shelves={allShelves} parents={parents} itemId={item.id} defaults={item} />
          <FormError error={actionData && "error" in actionData ? actionData.error : null} />
          <Group>
            <SubmitButton>Speichern</SubmitButton>
            <Button component={Link} to={returnTo} variant="subtle">Abbrechen</Button>
          </Group>
        </Stack>
      </Form>

      <Divider my="xl" />

      <Title order={4} mb="xs">Mit anderem Artikel zusammenführen</Title>
      <Text size="sm" c="dimmed" mb="md">
        Für Duplikate: Rezepte und Einkaufslisten verwenden danach den gewählten Artikel, und {item.name} wird gelöscht.
      </Text>
      <Form method="post" onSubmit={confirmFirst(`${item.name} mit dem gewählten Artikel zusammenführen? Das lässt sich nicht rückgängig machen.`)}>
        <input type="hidden" name="intent" value="merge" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Stack>
          <Select
            name="keepId"
            label="Behalten"
            data={otherItems.map((i) => ({ value: String(i.id), label: i.name }))}
            searchable
            required
            placeholder="Artikel wählen…"
          />
          <FormError error={actionData && "mergeError" in actionData ? actionData.mergeError : null} />
          <Group>
            <SubmitButton variant="light" color="red">Zusammenführen</SubmitButton>
          </Group>
        </Stack>
      </Form>
    </Container>
  );
}
