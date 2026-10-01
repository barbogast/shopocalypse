import { Container, NumberInput, Stack, Textarea, TextInput, Title } from "@mantine/core";
import { Form, redirect } from "react-router";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { recipes } from "~/db/schema";
import { int, optionalText, text } from "~/forms";
import type { Route } from "./+types/recipes.new";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Recipe – Shopocalypse" }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = text(form, "name");
  const servingSize = int(form, "servingSize");
  const instructions = optionalText(form, "instructions");
  const comments = optionalText(form, "comments");

  if (!name || !servingSize) return { error: "Name and a whole-number serving size are required." };

  const [recipe] = await db.insert(recipes).values({ name, servingSize, instructions, comments }).returning();
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
          <Textarea name="instructions" label="Cooking instructions" description="Supports markdown" autosize minRows={4} />
          <Textarea name="comments" label="Comments" autosize minRows={2} />
          {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
          <SubmitButton>Create</SubmitButton>
        </Stack>
      </Form>
    </Container>
  );
}
