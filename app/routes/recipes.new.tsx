import { Container, NumberInput, Stack, Textarea, TextInput, Title } from "@mantine/core";
import { Form, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { recipes } from "~/db/schema";
import { int, optionalText, optionalUrl, text } from "~/forms";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/recipes.new";

export function meta({}: Route.MetaArgs) {
  return [{ title: pageTitle("New Recipe") }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = text(form, "name");
  const servingSize = int(form, "servingSize");
  const instructions = optionalText(form, "instructions");
  const comments = optionalText(form, "comments");
  const weblink = optionalUrl(form, "weblink");

  if (!name || !servingSize) return { error: "Name and a whole-number serving size are required." };
  if (weblink === undefined) return { error: "The weblink must be a web address, like https://example.com/recipe." };

  const [recipe] = await db.insert(recipes).values({ name, servingSize, instructions, comments, weblink }).returning();
  return redirect(`/recipes/${recipe.id}`);
}

export default function NewRecipe({ actionData }: Route.ComponentProps) {
  return (
    <Container size="sm" py="xl">
      <Title mb="lg">New recipe</Title>
      <Form method="post">
        <Stack>
          <TextInput name="name" label="Name" required autoFocus />
          <NumberInput name="servingSize" label="Serving size" min={1} allowDecimal={false} defaultValue={4} required />
          <TextInput name="weblink" label="Weblink" placeholder="https://…" inputMode="url" />
          <Textarea name="instructions" label="Cooking instructions" description="Supports markdown" autosize minRows={4} />
          <Textarea name="comments" label="Comments" autosize minRows={2} />
          <FormError error={actionData?.error} />
          <SubmitButton>Create</SubmitButton>
        </Stack>
      </Form>
    </Container>
  );
}
