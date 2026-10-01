import { Button, Group, Text } from "@mantine/core";
import { IconMinus, IconPlus, IconUsers } from "@tabler/icons-react";
import { Form } from "react-router";

// Compact servings marker, e.g. "👥 6"
export function Servings({ servings }: { servings: number }) {
  return (
    <span style={{ whiteSpace: "nowrap" }} aria-label={`${servings} servings`}>
      {" "}
      <IconUsers size="1em" style={{ verticalAlign: "-0.125em" }} /> {servings}
    </span>
  );
}

// Minus/plus buttons for a scheduled meal's servings
export function ServingsControl({ position, servings }: { position: number; servings: number }) {
  return (
    <Form method="post" style={{ display: "flex", alignItems: "center" }}>
      <input type="hidden" name="intent" value="servings" />
      <input type="hidden" name="position" value={position} />
      <Button type="submit" name="servings" value={servings - 1} disabled={servings <= 1}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Fewer servings">
        <IconMinus size={14} />
      </Button>
      <Group gap={4} wrap="nowrap" c="dimmed" aria-label={`${servings} servings`}>
        <IconUsers size={14} />
        <Text size="sm">{servings}</Text>
      </Group>
      <Button type="submit" name="servings" value={servings + 1}
        variant="subtle" color="gray" size="xs" px={6} aria-label="More servings">
        <IconPlus size={14} />
      </Button>
    </Form>
  );
}
