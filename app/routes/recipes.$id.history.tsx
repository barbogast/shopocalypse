import { Accordion, Box, Button, Collapse, Container, Group, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { asc, eq } from "drizzle-orm";
import { Link } from "react-router";
import { LocalDateTime } from "~/components/local-date-time";
import { db } from "~/db/client";
import * as schema from "~/db/schema";
import { pageTitle } from "~/page-title";
import { type DiffLine, diffVersions } from "~/recipe-history";
import type { Route } from "./+types/recipes.$id.history";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: pageTitle(data ? `${data.recipe.name} – Verlauf` : "Verlauf") }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const recipe = await db.select({ id: schema.recipes.id, name: schema.recipes.name }).from(schema.recipes).where(eq(schema.recipes.id, id)).get();
  if (!recipe) throw new Response("Not found", { status: 404 });

  const rows = await db
    .select()
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, id))
    .orderBy(asc(schema.recipeVersions.savedAt), asc(schema.recipeVersions.id));
  // Each version with what changed since the one before; newest first
  const versions = rows
    .map((v, i) => ({ id: v.id, savedAt: v.savedAt, text: v.text, diff: i > 0 ? diffVersions(rows[i - 1].text, v.text) : null }))
    .reverse();

  return { recipe, versions };
}

const LINE_STYLES = {
  added: { bg: "var(--mantine-color-green-light)", c: "var(--mantine-color-green-light-color)", marker: "+" },
  removed: { bg: "var(--mantine-color-red-light)", c: "var(--mantine-color-red-light-color)", marker: "−" },
  same: { bg: undefined, c: "dimmed", marker: " " },
};

// Wraps long lines (instructions are a paragraph per line) and keeps blank ones their height
function TextLines({ children }: { children: ReactNode }) {
  return <Box fz="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</Box>;
}

function Diff({ lines }: { lines: DiffLine[] }) {
  return (
    <TextLines>
      {lines.map((line, i) => {
        if (line.kind === "skipped") {
          return <Text key={i} size="xs" c="dimmed" fs="italic" py={2}>⋯ {line.count} unveränderte Zeilen</Text>;
        }
        const style = LINE_STYLES[line.kind];
        return (
          <Group key={i} gap={6} wrap="nowrap" align="flex-start" bg={style.bg} c={style.c} px={4}>
            <Box component="span" ff="monospace" aria-hidden>{style.marker}</Box>
            <Box component="span" td={line.kind === "removed" ? "line-through" : undefined}>{line.text || " "}</Box>
          </Group>
        );
      })}
    </TextLines>
  );
}

function FullVersion({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <Button variant="subtle" size="xs" mt="sm" px={0} onClick={() => setShown((s) => !s)}>
        {shown ? "Vollständige Version ausblenden" : "Vollständige Version zeigen"}
      </Button>
      <Collapse expanded={shown}>
        <TextLines>{text}</TextLines>
      </Collapse>
    </>
  );
}

export default function RecipeHistory({ loaderData }: Route.ComponentProps) {
  const { recipe, versions } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" align="baseline" mb="lg">
        <Title>{recipe.name}</Title>
        <Button component={Link} to={`/recipes/${recipe.id}`} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          Rezept
        </Button>
      </Group>

      <Title order={3} mb="sm">Verlauf</Title>
      {versions.length === 0 ? (
        <Text size="sm" c="dimmed">Noch keine Versionen.</Text>
      ) : (
        <Accordion variant="separated" multiple defaultValue={[String(versions[0].id)]}>
          {versions.map((v, i) => (
            <Accordion.Item key={v.id} value={String(v.id)}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap" pr="xs">
                  <Text size="sm"><LocalDateTime iso={v.savedAt} /></Text>
                  <Text size="sm" c="dimmed">
                    {[i === 0 && "Aktuell", v.diff ? `+${v.diff.added} −${v.diff.removed}` : "Erste Version"].filter(Boolean).join(" · ")}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {v.diff ? (
                  <>
                    <Diff lines={v.diff.lines} />
                    <FullVersion text={v.text} />
                  </>
                ) : (
                  <TextLines>{v.text}</TextLines>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Container>
  );
}
