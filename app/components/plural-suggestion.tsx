import { Button, Text } from "@mantine/core";
import { useFetcher } from "react-router";
import type { action } from "~/routes/recipes.import";

// Offers to save an unknown ingredient name as the plural of the item it probably is, which
// then matches it. Never matched without asking: guessing plurals goes wrong too often.
// Saved through the recipe import's action, so it works from any page.
export function PluralSuggestion({ name, singular }: { name: string; singular: { id: number; name: string } | undefined }) {
  const fetcher = useFetcher<typeof action>();
  if (!singular) return null;
  return (
    <fetcher.Form method="post" action="/recipes/import" style={{ display: "inline" }}>
      <input type="hidden" name="intent" value="set-plural" />
      <input type="hidden" name="itemId" value={singular.id} />
      <input type="hidden" name="plural" value={name} />
      <Button type="submit" size="compact-xs" variant="subtle" ml={4} loading={fetcher.state !== "idle"}>
        Plural von {singular.name}?
      </Button>
      {fetcher.data?.error && <Text span size="xs" c="red" ml={4}>{fetcher.data.error}</Text>}
    </fetcher.Form>
  );
}
