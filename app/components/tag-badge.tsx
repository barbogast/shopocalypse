import { Badge, type BadgeProps } from "@mantine/core";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import type { TagColor } from "~/tag-colors";

export function TagBadge({ name, color, ...props }: { name: string; color: TagColor } & Omit<BadgeProps, "color">) {
  return <Badge size="xs" variant="light" color={color} {...props}>{name}</Badge>;
}

// A tag to filter by: light like its badge elsewhere, filled while chosen. Excluded, it's
// gray and struck through instead, since its own color would read as "with"
export function TagChip({ name, color, checked, excluded = false, onChange }: {
  name: string;
  color: TagColor;
  checked: boolean;
  excluded?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Badge
      component="button"
      type="button"
      size="lg"
      variant={excluded ? "outline" : checked ? "filled" : "light"}
      color={excluded ? "gray" : color}
      aria-pressed={checked || excluded}
      aria-label={excluded ? `Ohne ${name}` : undefined}
      onClick={() => onChange(!checked)}
      leftSection={excluded ? <IconMinus size={12} /> : checked ? <IconCheck size={12} /> : undefined}
      style={{ cursor: "pointer", textTransform: "none", fontWeight: 500, textDecoration: excluded ? "line-through" : undefined }}
    >
      {name}
    </Badge>
  );
}
