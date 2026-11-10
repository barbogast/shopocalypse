import { Badge, type BadgeProps } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import type { TagColor } from "~/tag-colors";

export function TagBadge({ name, color, ...props }: { name: string; color: TagColor } & Omit<BadgeProps, "color">) {
  return <Badge size="xs" variant="light" color={color} {...props}>{name}</Badge>;
}

// A tag to filter by: light like its badge elsewhere, filled while chosen
export function TagChip({ name, color, checked, onChange }: {
  name: string;
  color: TagColor;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Badge
      component="button"
      type="button"
      size="lg"
      variant={checked ? "filled" : "light"}
      color={color}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      leftSection={checked ? <IconCheck size={12} /> : undefined}
      style={{ cursor: "pointer", textTransform: "none", fontWeight: 500 }}
    >
      {name}
    </Badge>
  );
}
