import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { type Amount, nameForAmounts } from "~/units";

// An ingredient's name, in the plural if its amount calls for one, with its note (e.g. "finely chopped")
// below it. `children` go right after the name, like a badge.
export function IngredientName({ name, plural, quantity, unit, note, children }: Amount & {
  name: string;
  plural?: string | null;
  note: string | null;
  children?: ReactNode;
}) {
  return (
    <>
      {nameForAmounts({ name, plural }, [{ quantity, unit }])}
      {children}
      {note && <Text size="sm" c="dimmed">{note}</Text>}
    </>
  );
}
