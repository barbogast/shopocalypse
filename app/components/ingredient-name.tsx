import { Group, Text } from "@mantine/core";
import { IconShoppingCart, IconSnowflake } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { type Amount, nameForAmounts } from "~/units";

// An ingredient's name, in the plural if its amount calls for one, with its note (e.g. "finely chopped")
// below it, with a cart if the note also goes on the shopping list, and a snowflake if it has to be thawed first. `children` go right after the name, like a badge;
// `noteControl` right after the note, on the same line.
export function IngredientName({ name, plural, quantity, unit, note, noteOnList, needsThawing, noteControl, children }: Amount & {
  name: string;
  plural?: string | null;
  needsThawing?: boolean;
  note: string | null;
  noteOnList?: boolean;
  noteControl?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {nameForAmounts({ name, plural }, [{ quantity, unit }])}
      {needsThawing && (
        <IconSnowflake size={14} color="var(--mantine-color-cyan-6)" aria-label="Muss aufgetaut werden" style={{ marginLeft: 4, verticalAlign: "-2px" }} />
      )}
      {children}
      {note && (
        <Group gap="sm" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {noteOnList && <IconShoppingCart size={12} aria-label="Auf der Einkaufsliste" style={{ marginRight: 4 }} />}
            {note}
          </Text>
          {noteControl}
        </Group>
      )}
    </>
  );
}
