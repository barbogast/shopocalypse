import { Group, type GroupProps, Text } from "@mantine/core";
import { IconSnowflake } from "@tabler/icons-react";
import { type Amount, nameForAmounts } from "~/units";

// One line naming a meal's ingredients that have to come out of the freezer ahead of cooking; nothing if there are none
export function ThawWarning({ ingredients, ...props }: GroupProps & {
  ingredients: (Amount & { name: string; plural: string | null; needsThawing?: boolean })[];
}) {
  const frozen = ingredients.filter((i) => i.needsThawing);
  if (frozen.length === 0) return null;
  return (
    <Group gap={6} wrap="nowrap" c="cyan.7" {...props}>
      <IconSnowflake size={16} style={{ flexShrink: 0 }} aria-hidden />
      <Text size="sm" c="inherit">Auftauen: {frozen.map((i) => nameForAmounts(i, [i])).join(", ")}</Text>
    </Group>
  );
}
