import { type ComboboxItem, Group, type OptionsFilter, Select, type SelectProps, Text } from "@mantine/core";
import { TagBadge } from "~/components/tag-badge";
import type { Tag } from "~/db/tags.server";

export type SelectableRecipe = { id: number; name: string; tags: Pick<Tag, "name" | "color">[] };

// Searchable recipe picker whose options show each recipe's tags; typing a tag finds its recipes
export function RecipeSelect({ recipes, ...props }: { recipes: SelectableRecipe[] } & Omit<SelectProps, "data">) {
  const tagsById = new Map(recipes.map((r) => [String(r.id), r.tags]));
  const filter: OptionsFilter = ({ options, search }) => {
    const query = search.trim().toLocaleLowerCase();
    return (options as ComboboxItem[]).filter((o) =>
      o.label.toLocaleLowerCase().includes(query)
      || tagsById.get(o.value)?.some((t) => t.name.toLocaleLowerCase().includes(query)));
  };

  return (
    <Select
      {...props}
      data={recipes.map((r) => ({ value: String(r.id), label: r.name }))}
      searchable
      filter={filter}
      renderOption={({ option }) => (
        <Group gap={6} wrap="wrap">
          <Text size="sm">{option.label}</Text>
          {tagsById.get(option.value)?.map((tag) => <TagBadge key={tag.name} {...tag} />)}
        </Group>
      )}
    />
  );
}
