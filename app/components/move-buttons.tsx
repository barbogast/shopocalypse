import { Button } from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { Form } from "react-router";

// Up/down buttons; submits the intent, the given fields and direction=up|down
export function MoveButtons({ intent, fields, first, last }: {
  intent: string;
  fields: Record<string, string | number>;
  first: boolean;
  last: boolean;
}) {
  return (
    <Form method="post" style={{ display: "flex" }}>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" name="direction" value="up" disabled={first}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Move up">
        <IconChevronUp size={14} />
      </Button>
      <Button type="submit" name="direction" value="down" disabled={last}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Move down">
        <IconChevronDown size={14} />
      </Button>
    </Form>
  );
}
