import { Alert, type AlertProps } from "@mantine/core";
import { IconSnowflake } from "@tabler/icons-react";
import { type Amount, nameForAmounts } from "~/units";

// Names a meal's ingredients that have to come out of the freezer ahead of cooking; nothing if there are none
export function ThawWarning({ ingredients, ...props }: AlertProps & {
  ingredients: (Amount & { name: string; plural: string | null; needsThawing?: boolean })[];
}) {
  const frozen = ingredients.filter((i) => i.needsThawing);
  if (frozen.length === 0) return null;
  return (
    <Alert color="cyan" variant="light" icon={<IconSnowflake size={18} />} title="Rechtzeitig auftauen" {...props}>
      {frozen.map((i) => nameForAmounts(i, [i])).join(", ")}
    </Alert>
  );
}
