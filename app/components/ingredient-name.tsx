import { Text } from "@mantine/core";
import type { ReactNode } from "react";

// An ingredient's name, with its note (e.g. "finely chopped") below it.
// `children` go right after the name, like a badge.
export function IngredientName({ name, note, children }: { name: string; note: string | null; children?: ReactNode }) {
  return (
    <>
      {name}
      {children}
      {note && <Text size="sm" c="dimmed">{note}</Text>}
    </>
  );
}
