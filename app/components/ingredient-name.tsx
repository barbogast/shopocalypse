import { Group, Text } from "@mantine/core";
import { IconShoppingCart } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { type Amount, nameForAmounts } from "~/units";

// An ingredient's name, in the plural if its amount calls for one, with its note (e.g. "finely chopped")
// below it, with a cart if the note also goes on the shopping list. `children` go right after the name, like a badge;
// `noteControl` right after the note, on the same line.
export function IngredientName({ name, plural, quantity, unit, note, noteOnList, noteControl, children }: Amount & {
  name: string;
  plural?: string | null;
  note: string | null;
  noteOnList?: boolean;
  noteControl?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {nameForAmounts({ name, plural }, [{ quantity, unit }])}
      {children}
      {note && (
        <Group gap="sm" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {noteOnList && <IconShoppingCart size={12} aria-label="On the shopping list" style={{ marginRight: 4 }} />}
            {note}
          </Text>
          {noteControl}
        </Group>
      )}
    </>
  );
}
