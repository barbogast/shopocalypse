import { Box, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { DiffLine } from "~/recipe-history";

const LINE_STYLES = {
  added: { bg: "var(--mantine-color-green-light)", c: "var(--mantine-color-green-light-color)", marker: "+", strong: "var(--mantine-color-green-light-hover)" },
  removed: { bg: "var(--mantine-color-red-light)", c: "var(--mantine-color-red-light-color)", marker: "−", strong: "var(--mantine-color-red-light-hover)" },
  same: { bg: undefined, c: "dimmed", marker: " ", strong: undefined },
};

// Wraps long lines (instructions are a paragraph per line) and keeps blank ones their height
export function TextLines({ children }: { children: ReactNode }) {
  return <Box fz="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</Box>;
}

// A recipe text diff, line by line; in an edited line the changed words stand out
export function RecipeDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <TextLines>
      {lines.map((line, i) => {
        if (line.kind === "skipped") {
          return <Text key={i} size="xs" c="dimmed" fs="italic" py={2}>⋯ {line.count} unveränderte Zeilen</Text>;
        }
        const style = LINE_STYLES[line.kind];
        const words = "words" in line ? line.words : undefined;
        return (
          <Group key={i} gap={6} wrap="nowrap" align="flex-start" bg={style.bg} c={style.c} px={4}>
            <Box component="span" ff="monospace" style={{ flexShrink: 0 }} aria-hidden>{style.marker}</Box>
            <Box component="span" td={line.kind === "removed" && !words ? "line-through" : undefined}>
              {words
                ? words.map((w, j) => w.changed
                  ? <Box key={j} component="span" bg={style.strong} fw={600} td={line.kind === "removed" ? "line-through" : undefined}>{w.text}</Box>
                  : w.text)
                : line.text || " "}
            </Box>
          </Group>
        );
      })}
    </TextLines>
  );
}
