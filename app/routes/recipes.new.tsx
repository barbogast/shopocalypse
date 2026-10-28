import { Container, NumberInput, Stack, Textarea, TextInput, Title } from "@mantine/core";
import { Form, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { recordRecipeVersion } from "~/db/recipe-versions";
import * as schema from "~/db/schema";
import { int, optionalText, optionalUrl, text } from "~/forms";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/recipes.new";

export function meta({}: Route.MetaArgs) {
  return [{ title: pageTitle("Neues Rezept") }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = text(form, "name");
  const servingSize = int(form, "servingSize");
  const instructions = optionalText(form, "instructions");
  const comments = optionalText(form, "comments");
  const weblink = optionalUrl(form, "weblink");

  if (!name || !servingSize) return { error: "Name und eine ganze Zahl als Portionen sind erforderlich." };
  if (weblink === undefined) return { error: "Der Weblink muss eine Webadresse sein, z. B. https://example.com/rezept." };

  const [recipe] = await db.insert(schema.recipes).values({ name, servingSize, instructions, comments, weblink }).returning();
  await recordRecipeVersion(db, recipe.id);
  return redirect(`/recipes/${recipe.id}`);
}

export default function NewRecipe({ actionData }: Route.ComponentProps) {
  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Neues Rezept</Title>
      <Form method="post">
        <Stack>
          <TextInput name="name" label="Name" required autoFocus />
          <NumberInput name="servingSize" label="Portionen" min={1} allowDecimal={false} defaultValue={4} required />
          <TextInput name="weblink" label="Weblink" placeholder="https://…" inputMode="url" />
          <Textarea name="instructions" label="Zubereitung" description="Markdown möglich" autosize minRows={4} />
          <Textarea name="comments" label="Anmerkungen" autosize minRows={2} />
          <FormError error={actionData?.error} />
          <SubmitButton>Anlegen</SubmitButton>
        </Stack>
      </Form>
    </Container>
  );
}
