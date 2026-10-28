import { Checkbox, Container, Stack, Text, Title } from "@mantine/core";
import { IconShoppingCart } from "@tabler/icons-react";
import { useState } from "react";
import { Form } from "react-router";
import { Servings } from "~/components/servings";
import { SubmitButton } from "~/components/submit-button";

// With no active list: pick the scheduled meals to shop for
export function PrepareList({ scheduled }: { scheduled: { position: number; name: string; servings: number; servingSize: number }[] }) {
  const [selected, setSelected] = useState(() => new Set(scheduled.map((m) => m.position)));
  const toggle = (position: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(position);
      else next.delete(position);
      return next;
    });

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Einkaufen</Title>
      <Text c="dimmed" mb="xl">Keine aktive Einkaufsliste.</Text>
      <Form method="post">
        <input type="hidden" name="intent" value="prepare" />
        <Stack maw={300}>
          <Text size="sm" fw={500}>Mahlzeiten, für die eingekauft wird</Text>
          {scheduled.length > 0 ? (
            <Stack gap="xs">
              {scheduled.map((meal) => (
                <Checkbox
                  key={meal.position}
                  name="position"
                  value={meal.position}
                  label={<>{meal.name}{meal.servings !== meal.servingSize && <Servings servings={meal.servings} />}</>}
                  checked={selected.has(meal.position)}
                  onChange={(e) => toggle(meal.position, e.currentTarget.checked)}
                />
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">Keine Mahlzeiten geplant.</Text>
          )}
          <Checkbox
            name="includeInStock"
            label="Vorrätige Artikel einbeziehen"
            description="Auch Artikel hinzufügen, die als immer vorrätig markiert sind"
            mt="xs"
          />
          <SubmitButton leftSection={<IconShoppingCart size={16} />}>
            {selected.size > 0 ? "Liste erstellen" : "Leere Liste beginnen"}
          </SubmitButton>
        </Stack>
      </Form>
    </Container>
  );
}
