import { Button, Checkbox, Group, Select, Text, TextInput } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { StoreShelfFields } from "~/components/store-shelf-fields";
import type * as schema from "~/db/schema";
import type { action as suggestAction } from "~/routes/items.suggest";
import { UNIT_OPTIONS } from "~/units";

type Store = typeof schema.stores.$inferSelect;
type Shelf = typeof schema.itemCategories.$inferSelect;

type Values = {
  name?: string;
  plural?: string | null;
  parentId?: number | null;
  storeId?: number | null;
  categoryId?: number | null;
  defaultUnit?: string | null;
  alwaysAvailable?: boolean;
};

// The item form's fields, read on the server by parseItemForm
export function ItemFields({
  stores,
  shelves,
  parents,
  itemId,
  defaults = {},
  autoFocus = false,
}: {
  stores: Store[];
  shelves: Shelf[];
  // Items it can be a variant of; leave out when it can't be one (it has variants itself)
  parents?: { id: number; name: string; storeId: number | null; categoryId: number | null }[];
  // The item being edited, left out of the examples its suggestion is based on
  itemId?: number;
  defaults?: Values;
  autoFocus?: boolean;
}) {
  // The fields start from these; a suggestion replaces them and remounts the fields
  const [base, setBase] = useState<Values>(defaults);
  const [version, setVersion] = useState(0);
  const [parentId, setParentId] = useState(base.parentId ? String(base.parentId) : null);
  // Picking another parent prefills its store and shelf
  const newParent = parentId !== (base.parentId ? String(base.parentId) : null)
    ? parents?.find((p) => String(p.id) === parentId)
    : undefined;
  const location = newParent ?? base;

  const suggest = useSuggestion(parents, stores, (filled) => {
    setBase(filled);
    setParentId(filled.parentId ? String(filled.parentId) : null);
    setVersion((v) => v + 1);
  });

  return (
    <>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        {/* data-autofocus: focused when shown in a Mantine modal */}
        <TextInput
          key={`name-${version}`}
          name="name"
          label="Name"
          defaultValue={base.name}
          required
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
          style={{ flex: 1 }}
        />
        <Button
          variant="light"
          leftSection={<IconSparkles size={16} />}
          loading={suggest.loading}
          onClick={(e) => suggest.run(e, itemId)}
        >
          Vorschlagen
        </Button>
      </Group>
      {suggest.message && <Text size="sm" c={suggest.message.error ? "red" : "dimmed"} mt={-8}>{suggest.message.text}</Text>}
      <TextInput
        key={`plural-${version}`}
        name="plural"
        label="Plural"
        description="Wird beim Rezeptimport auch erkannt"
        defaultValue={base.plural ?? undefined}
      />
      {parents && (
        <Select
          name="parentId"
          label="Variante von"
          description="Wird darunter aufgeführt, z. B. Berglinsen unter Linsen"
          data={parents.map((p) => ({ value: String(p.id), label: p.name }))}
          value={parentId}
          onChange={setParentId}
          searchable
          clearable
          placeholder="Keine"
        />
      )}
      <StoreShelfFields
        key={`${version}-${parentId ?? "none"}`}
        stores={stores}
        shelves={shelves}
        defaultStoreId={location.storeId}
        defaultShelfId={location.categoryId}
      />
      <Select
        key={`unit-${version}`}
        name="defaultUnit"
        label="Standardeinheit"
        data={UNIT_OPTIONS}
        defaultValue={base.defaultUnit}
        clearable
        placeholder="Keine"
      />
      <Checkbox
        key={`available-${version}`}
        name="alwaysAvailable"
        label="Immer vorrätig"
        description="Kommt nicht auf neue Einkaufslisten"
        defaultChecked={base.alwaysAvailable}
      />
    </>
  );
}

// Asks for a suggestion for the name typed in the form, then fills the fields that are still empty,
// keeping everything already entered
function useSuggestion(
  parents: { id: number }[] | undefined,
  stores: Store[],
  apply: (filled: Values) => void,
) {
  const fetcher = useFetcher<typeof suggestAction>();
  // The form's values when Vorschlagen was clicked
  const current = useRef<Values>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = (e: MouseEvent<HTMLButtonElement>, itemId?: number) => {
    const form = new FormData(e.currentTarget.form ?? undefined);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setMessage({ text: "Bitte zuerst einen Namen eingeben.", error: true });
      return;
    }
    const id = (field: string) => Number(form.get(field)) || null;
    current.current = {
      name,
      plural: String(form.get("plural") ?? "").trim() || null,
      parentId: id("parentId"),
      storeId: id("storeId"),
      categoryId: id("categoryId"),
      defaultUnit: String(form.get("defaultUnit") ?? "") || null,
      alwaysAvailable: form.get("alwaysAvailable") === "on",
    };
    setMessage(null);
    fetcher.submit({ name, ...(itemId && { itemId }) }, { method: "post", action: "/items/suggest" });
  };

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if ("error" in data) {
      setMessage({ text: data.error, error: true });
      return;
    }
    const suggestion = data.suggestions[0];
    const was = current.current;
    const filled: string[] = [];
    const pick = <T,>(value: T | null | undefined, suggested: T | null, label: string) => {
      if (value != null || suggested == null) return value ?? null;
      filled.push(label);
      return suggested;
    };
    const parentOk = parents?.some((p) => p.id === suggestion.parentId) ? suggestion.parentId : null;
    const storeOk = stores.some((s) => s.id === suggestion.storeId) ? suggestion.storeId : null;
    const next: Values = {
      // A plural name is always replaced by its singular, and the plural field takes the name if it's empty
      name: suggestion.singular ?? was.name,
      plural: pick(was.plural, suggestion.plural, "Plural"),
      parentId: pick(was.parentId, parentOk, "Variante von"),
      storeId: pick(was.storeId, storeOk, "Laden"),
      categoryId: was.categoryId ?? null,
      defaultUnit: pick(was.defaultUnit, suggestion.defaultUnit, "Einheit"),
      alwaysAvailable: was.alwaysAvailable,
    };
    // A suggested shelf is in the suggested store, so it only fills in where that's the store now
    if (next.storeId === suggestion.storeId) next.categoryId = pick(was.categoryId, suggestion.categoryId, "Regal");
    apply(next);
    const changes = [
      suggestion.singular && `Umbenannt in ${suggestion.singular}`,
      filled.length > 0 && `ausgefüllt: ${filled.join(", ")}`,
    ].filter(Boolean).join("; ");
    setMessage({ text: changes ? changes[0].toUpperCase() + changes.slice(1) : "Keine Vorschläge für die leeren Felder.", error: false });
  }, [fetcher.data]);

  return { run, loading: fetcher.state !== "idle", message };
}
