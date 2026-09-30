import { Button, Container, NumberInput, Stack, Textarea, TextInput, Title } from "@mantine/core";
import { redirect } from "react-router";
import { db } from "~/db/client";
import { recipes } from "~/db/schema";
import type { Route } from "./+types/recipes.new";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Recipe – Shopocalypse" }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = String(form.get("name")).trim();
  const servingSize = Number(form.get("servingSize"));
  const instructions = String(form.get("instructions") ?? "").trim() || null;
  const comments = String(form.get("comments") ?? "").trim() || null;

  if (!name || servingSize < 1) return { error: "Name and serving size are required." };

  const [recipe] = await db.insert(recipes).values({ name, servingSize, instructions, comments }).returning();
  return redirect(`/recipes/${recipe.id}`);
}

export default function NewRecipe({ actionData }: Route.ComponentProps) {
  return (
    <Container size="sm" py="xl">
      <Title mb="lg">New recipe</Title>
      <form method="post">
        <Stack>
          <TextInput name="name" label="Name" required autoFocus />
          <NumberInput name="servingSize" label="Serving size" min={1} defaultValue={4} required />
          <Textarea name="instructions" label="Cooking instructions" description="Supports markdown" autosize minRows={4} />
          <Textarea name="comments" label="Comments" autosize minRows={2} />
          {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
          <Button type="submit">Create</Button>
        </Stack>
      </form>
    </Container>
  );
}
