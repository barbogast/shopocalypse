import { Badge, type BadgeProps } from "@mantine/core";
import type { TagColor } from "~/tag-colors";

export function TagBadge({ name, color, ...props }: { name: string; color: TagColor } & Omit<BadgeProps, "color">) {
  return <Badge size="xs" variant="light" color={color} {...props}>{name}</Badge>;
}
