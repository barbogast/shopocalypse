import {
  ActionIcon,
  AspectRatio,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Drawer,
  Group,
  Image,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconMinus, IconPhoto, IconRefreshOff, IconSearch, IconUsers } from "@tabler/icons-react";
import { addTransitionType, type ReactNode, startTransition, useState, ViewTransition } from "react";
import { useFetchers, useSubmit } from "react-router";
import { TagBadge, TagChip } from "~/components/tag-badge";
import type { Tag } from "~/db/tags.server";

export type PickableRecipe = { id: number; name: string; autoFill: boolean; thumbnailUrl: string | null; tags: Tag[] };

type Fields = Record<string, string>;

const ONLY_FILTER = { filter: "auto", default: "none" };

// Picks meals from a grid of recipe cards. Each tap adds one in the background and the
// drawer stays open, so several meals take just as many taps. The servings and the tag
// filter at the top apply to everything added here, the footer's auto-fill included. A tag
// chip cycles through "only with", "without" and off; one tag filters at a time.
export function RecipePicker({
  opened,
  onClose,
  title,
  recipes,
  counts,
  countLabel,
  defaultServings,
  addIntent,
  removeFields,
  markNoAutoFill = false,
  footer,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  recipes: PickableRecipe[];
  // How often each recipe is already there, by recipe id
  counts: Map<number, number>;
  // Where the counted meals are, e.g. "im Speiseplan"
  countLabel: string;
  // Empty means each recipe's serving size
  defaultServings: number | "";
  addIntent: string;
  // The form fields that take one of the recipe's meals off again, or null when there's none
  removeFields: (recipeId: number) => Fields | null;
  // Marks the recipes auto-fill skips
  markNoAutoFill?: boolean;
  footer?: (filter: { tag: Tag | null; excludeTag: boolean; servings: string }) => ReactNode;
}) {
  const [servings, setServings] = useState<string | number>(defaultServings);
  const [tagId, setTagId] = useState<number | null>(null);
  const [excludeTag, setExcludeTag] = useState(false);
  const [search, setSearch] = useState("");
  const submit = useSubmit();

  // Meals on their way, so the counts change with the tap rather than after the reload
  const pending = new Map<number, number>();
  const removing = new Set<number>();
  for (const f of useFetchers()) {
    const recipeId = Number(f.formData?.get("pickerRecipeId"));
    if (!recipeId) continue;
    const delta = Number(f.formData!.get("pickerDelta"));
    pending.set(recipeId, (pending.get(recipeId) ?? 0) + delta);
    if (delta < 0) removing.add(recipeId);
  }

  function send(recipeId: number, delta: 1 | -1, fields: Fields) {
    submit({ ...fields, pickerRecipeId: String(recipeId), pickerDelta: String(delta) }, { method: "post", navigate: false });
  }

  const tags = [...new Map(recipes.flatMap((r) => r.tags).map((t) => [t.id, t])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const tag = tags.find((t) => t.id === tagId) ?? null;

  function cycleTag(id: number) {
    if (tagId !== id) {
      setTagId(id);
      setExcludeTag(false);
    } else if (!excludeTag) {
      setExcludeTag(true);
    } else {
      setTagId(null);
      setExcludeTag(false);
    }
  }

  const query = search.trim().toLocaleLowerCase();
  const shown = recipes.filter((r) =>
    (!tag || r.tags.some((t) => t.id === tag.id) !== excludeTag)
    && (!query || r.name.toLocaleLowerCase().includes(query) || r.tags.some((t) => t.name.toLocaleLowerCase().includes(query))));

  return (
    <Drawer opened={opened} onClose={onClose} position="bottom" size="90%" title={<Text fw={600} size="lg">{title}</Text>}>
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap">
          <NumberInput
            aria-label="Portionen"
            placeholder="Wie im Rezept"
            min={1}
            allowDecimal={false}
            value={servings}
            onChange={setServings}
            leftSection={<IconUsers size={16} />}
            w={150}
          />
          <TextInput
            aria-label="Suchen"
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            style={{ flex: 1, minWidth: 0 }}
          />
        </Group>

        {tags.length > 0 && (
          <Stack gap={4}>
            <Group gap="xs">
              {tags.map((t) => (
                <TagChip key={t.id} name={t.name} color={t.color}
                  checked={tagId === t.id && !excludeTag} excluded={tagId === t.id && excludeTag}
                  onChange={() => startTransition(() => {
                    addTransitionType("filter");
                    cycleTag(t.id);
                  })} />
              ))}
            </Group>
            {/* Says what the next tap does, as the cycle isn't obvious */}
            {tag && (
              <Text size="xs" c="dimmed">
                {excludeTag ? `Ohne „${tag.name}“ · nochmal tippen zeigt alle` : `Nur „${tag.name}“ · nochmal tippen zeigt alle ohne`}
              </Text>
            )}
          </Stack>
        )}

        {shown.length === 0 ? (
          <Text c="dimmed" size="sm">Kein passendes Rezept.</Text>
        ) : (
          <SimpleGrid cols={{ base: 4, sm: 5 }} spacing="xs">
            {shown.map((recipe) => {
              const count = (counts.get(recipe.id) ?? 0) + (pending.get(recipe.id) ?? 0);
              const remove = removeFields(recipe.id);
              // Only a tag tap animates. React Router's updates are transitions too, and animating
              // those would swallow quick taps while each meal is added.
              return (
                <ViewTransition key={recipe.id} enter={ONLY_FILTER} exit={ONLY_FILTER} update={ONLY_FILTER} default="none">
                  <RecipeCard
                    recipe={recipe}
                    count={count}
                    countLabel={countLabel}
                    noAutoFill={markNoAutoFill && !recipe.autoFill}
                    onAdd={() => send(recipe.id, 1, { intent: addIntent, recipeId: String(recipe.id), servings: String(servings) })}
                    // One removal at a time: the next one would take off the same meal
                    onRemove={remove && !removing.has(recipe.id) ? () => send(recipe.id, -1, remove) : null}
                  />
                </ViewTransition>
              );
            })}
          </SimpleGrid>
        )}

        {markNoAutoFill && shown.some((r) => !r.autoFill) && (
          <Group gap={4} c="dimmed">
            <IconRefreshOff size={14} />
            <Text size="xs">Wird beim Auffüllen übersprungen</Text>
          </Group>
        )}

        {/* Slides along with the tiles, rather than jumping beneath the ones fading out */}
        <ViewTransition update={ONLY_FILTER} default="none">
          <Box pos="sticky" bottom={0} py="sm" bg="var(--mantine-color-body)"
            style={{ borderTop: "1px solid var(--mantine-color-default-border)", zIndex: 1 }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Box style={{ flex: 1, minWidth: 0 }}>{footer?.({ tag, excludeTag, servings: String(servings) })}</Box>
              <Button variant="default" onClick={onClose}>Fertig</Button>
            </Group>
          </Box>
        </ViewTransition>
      </Stack>
    </Drawer>
  );
}

function RecipeCard({ recipe, count, countLabel, noAutoFill, onAdd, onRemove }: {
  recipe: PickableRecipe;
  count: number;
  countLabel: string;
  noAutoFill: boolean;
  onAdd: () => void;
  onRemove: (() => void) | null;
}) {
  return (
    <Box pos="relative">
      <UnstyledButton onClick={onAdd} w="100%" h="100%" aria-label={`${recipe.name} hinzufügen`}>
        <Card withBorder radius="md" p={12} h="100%"
          style={count > 0 ? { borderColor: "var(--mantine-color-green-6)" } : undefined}>
          {/* Framed rather than edge to edge, so a grid of photos stays calm */}
          <AspectRatio ratio={1}
            style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)", overflow: "hidden" }}>
            {recipe.thumbnailUrl ? (
              <Image src={recipe.thumbnailUrl} alt="" />
            ) : (
              <Center bg="var(--mantine-color-default-hover)">
                <IconPhoto size={18} color="var(--mantine-color-dimmed)" />
              </Center>
            )}
          </AspectRatio>
          <Stack gap={2} pt={6}>
            <Text size="xs" lh={1.25} lineClamp={3} style={{ hyphens: "auto", overflowWrap: "break-word" }}>{recipe.name}</Text>
            {recipe.tags.length > 0 && (
              <Group gap={2}>
                {recipe.tags.map((tag) => <TagBadge key={tag.id} {...tag} />)}
              </Group>
            )}
          </Stack>
        </Card>
      </UnstyledButton>

      {noAutoFill && (
        <Center pos="absolute" top={16} left={16} p={2} bg="var(--mantine-color-body)" c="dimmed"
          style={{ borderRadius: "var(--mantine-radius-xl)" }} title="Wird beim Auffüllen übersprungen">
          <IconRefreshOff size={12} aria-label="Wird beim Auffüllen übersprungen" />
        </Center>
      )}

      {count > 0 && (
        <Group pos="absolute" top={16} right={16} gap={2} wrap="nowrap">
          {/* The padding catches taps around the small circle, which would otherwise add the meal instead */}
          <UnstyledButton disabled={!onRemove} onClick={onRemove ?? undefined} p={10} my={-10} ml={-10}
            aria-label={`${recipe.name} einmal entfernen`} style={{ display: "flex" }}>
            <ActionIcon component="span" size="sm" radius="xl" variant="default" disabled={!onRemove}>
              <IconMinus size={12} />
            </ActionIcon>
          </UnstyledButton>
          <Badge color="green" variant="filled" size="xs" aria-label={`${count}× ${countLabel}`}>×{count}</Badge>
        </Group>
      )}
    </Box>
  );
}
