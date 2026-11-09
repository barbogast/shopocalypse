import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, Code, Collapse, Container, Group, List, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { IconAlertCircle, IconCheck, IconFileImport, IconMessageCircle, IconSend, IconSettings, IconSparkles, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { asc, eq } from "drizzle-orm";
import { type FetcherWithComponents, Form, Link, redirect, type ShouldRevalidateFunctionArgs, useFetcher, useSearchParams } from "react-router";
import { FormError } from "~/components/form-error";
import { IngredientName } from "~/components/ingredient-name";
import { LineGutter, TEXT_METRICS } from "~/components/line-gutter";
import { PluralSuggestion } from "~/components/plural-suggestion";
import { RecipeDiff } from "~/components/recipe-diff";
import { LocalDateTime } from "~/components/local-date-time";
import { Markdown } from "~/components/markdown";
import { SubmitButton } from "~/components/submit-button";
import { Weblink } from "~/components/weblink";
import { db } from "~/db/client";
import { setPlural } from "~/db/items.server";
import { createDraft, deleteDraft, getDraft, listDrafts, saveChat, saveDraft } from "~/db/recipe-drafts.server";
import { copyRecipeTags } from "~/db/tags.server";
import { AcceptedSchema, applySuggestions } from "~/item-suggest.server";
import type { action as suggestAction } from "~/routes/items.suggest";
import { recipeText } from "~/db/recipe-versions";
import { importRecipe, updateRecipeFromText } from "~/db/recipes.server";
import { getSetting, setSetting } from "~/db/settings.server";
import * as schema from "~/db/schema";
import { editItemPath, int, text } from "~/forms";
import type { ChatMessage } from "~/recipe-chat";
import { chatRecipe, type KnownRecipe } from "~/recipe-chat.server";
import { type Photo, transcribeRecipe } from "~/recipe-photo.server";
import { itemKey, itemKeys, likelySingular } from "~/item-names";
import { diffVersions } from "~/recipe-history";
import { type ParsedIngredient, parseRecipeText } from "~/recipe-import";
import { formatAmount, UNITS, unitName, type UnitKey } from "~/units";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/recipes.import";

const PLACEHOLDER = `Spaghetti Carbonara
4
https://example.com/carbonara
---
400 g Spaghetti
4 Eier
Salz
---
Nudeln kochen…
---
Optionale Anmerkungen`;

export function meta({}: Route.MetaArgs) {
  return [{ title: pageTitle("Rezept importieren") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const allItems = await db.select({ id: schema.items.id, name: schema.items.name, plural: schema.items.plural }).from(schema.items);
  const recipeNames = await db.select({ name: schema.recipes.name }).from(schema.recipes).where(eq(schema.recipes.archived, false));
  // Names for the suggested stores and shelves of new items
  const allStores = await db.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores);
  const allShelves = await db.select({ id: schema.itemCategories.id, name: schema.itemCategories.name }).from(schema.itemCategories);
  // The draft being edited, from ?draft=
  const draftParam = new URL(request.url).searchParams.get("draft");
  const draft = draftParam ? (await getDraft(Number(draftParam))) ?? null : null;
  return {
    allItems, recipeNames: recipeNames.map((r) => r.name), allStores, allShelves,
    draft, draftGone: draftParam != null && !draft, drafts: await listDrafts(),
    original: draft?.recipeId ? await originalRecipe(draft.recipeId, allItems) : null,
    preferences: await getSetting("recipePreferences"),
  };
}

// The recipe a draft reworks: its text as saved, to show what changed, and the notes it puts on the shopping list,
// which the text leaves out. Those are found by position, since the text lists the ingredients in recipe order.
async function originalRecipe(id: number, allItems: { name: string; plural: string | null }[]) {
  const recipe = await db.select().from(schema.recipes).where(eq(schema.recipes.id, id)).get();
  if (!recipe) return null;
  const savedText = await recipeText(db, recipe);
  const rows = await db.select({ noteOnList: schema.recipeIngredients.noteOnList }).from(schema.recipeIngredients)
    .where(eq(schema.recipeIngredients.recipeId, id)).orderBy(asc(schema.recipeIngredients.position));
  const parsed = parseRecipeText(savedText, allItems).recipe.ingredients;
  const notesOnList = parsed.filter((ing, i) => ing.note && rows[i]?.noteOnList).map(noteKey);
  return { id, name: recipe.name, savedText, notesOnList };
}

// The recipes in use, with their ingredients in order, so the chat suggests something else; archived ones may come back
async function knownRecipes(): Promise<KnownRecipe[]> {
  const rows = await db
    .select({ id: schema.recipes.id, name: schema.recipes.name, ingredient: schema.items.name })
    .from(schema.recipes)
    .leftJoin(schema.recipeIngredients, eq(schema.recipeIngredients.recipeId, schema.recipes.id))
    .leftJoin(schema.items, eq(schema.items.id, schema.recipeIngredients.itemId))
    .where(eq(schema.recipes.archived, false))
    .orderBy(asc(schema.recipes.name), asc(schema.recipeIngredients.position));
  const recipes = new Map<number, KnownRecipe>();
  for (const { id, name, ingredient } of rows) {
    if (!recipes.has(id)) recipes.set(id, { name, ingredients: [] });
    if (ingredient) recipes.get(id)!.ingredients.push(ingredient);
  }
  return [...recipes.values()];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();

  // From the preview's plural suggestion, through a fetcher; the loader then matches the ingredient
  if (form.get("intent") === "set-plural") {
    const itemId = int(form, "itemId");
    const plural = text(form, "plural");
    if (!itemId || !plural) return { error: "Bitte eine Zutat und einen Plural angeben.", imported: null };
    return { ...(await setPlural(itemId, plural)), imported: null };
  }

  // From the suggestions for the new items, through a fetcher
  if (form.get("intent") === "apply-suggestions") {
    let accepted;
    try {
      accepted = AcceptedSchema.safeParse(JSON.parse(text(form, "accepted")));
    } catch {
      accepted = null;
    }
    if (!accepted?.success) return { error: "Die Vorschläge konnten nicht gelesen werden.", imported: null };
    return { error: null, imported: null, shelved: await applySuggestions(accepted.data) };
  }

  // From the photo button, through a fetcher; the text then goes into the textarea for review
  if (form.get("intent") === "transcribe-photo") {
    const photos: Photo[] = [];
    for (const file of form.getAll("photo")) {
      if (!(file instanceof File) || file.type !== "image/jpeg") return { error: "Das Foto konnte nicht gelesen werden.", imported: null };
      photos.push({ mediaType: "image/jpeg", base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
    }
    const result = await transcribeRecipe(photos);
    if ("error" in result) return { error: result.error, imported: null };
    // Saved straight away, so it can be finished on another device
    return redirect(`/recipes/import?draft=${await createDraft(result.text)}`);
  }

  // From the chat, through a fetcher, with the text as it stands, so edits not autosaved yet aren't lost.
  // Claude's text (if it changed any) replaces it; the first message starts a draft, which then opens.
  if (form.get("intent") === "chat") {
    const message = text(form, "message");
    if (!message) return { error: "Bitte eine Nachricht eingeben.", imported: null };
    const draftId = int(form, "draftId");
    const draft = draftId ? await getDraft(draftId) : null;
    if (draftId && !draft) return { error: "Diesen Entwurf gibt es nicht mehr: Er wurde importiert oder verworfen.", imported: null };
    const draftText = String(form.get("text") ?? "");
    const items = await db.select({ name: schema.items.name, plural: schema.items.plural }).from(schema.items);
    const preferences = await getSetting("recipePreferences");
    const result = await chatRecipe({ chat: draft?.chat ?? [], draftText, message, items, recipes: await knownRecipes(), preferences });
    if ("error" in result) return { error: result.error, imported: null };
    const newText = result.text ?? draftText;
    const changed = newText !== draftText ? { before: draftText, after: newText } : {};
    const chat: ChatMessage[] = [...(draft?.chat ?? []), { role: "user", content: message }, { role: "assistant", content: result.reply, ...changed }];
    if (draft) {
      await saveChat(draft.id, chat, newText);
      return { error: null, imported: null };
    }
    return redirect(`/recipes/import?draft=${await createDraft(newText, chat)}`);
  }

  // From the chat's preferences, through a fetcher
  if (form.get("intent") === "save-preferences") {
    await setSetting("recipePreferences", text(form, "preferences"));
    return { error: null, imported: null };
  }

  // Autosaved while editing a draft, through a fetcher; not trimmed, so the text stays as typed
  if (form.get("intent") === "save-draft") {
    const draftId = int(form, "draftId");
    if (draftId) await saveDraft(draftId, String(form.get("text") ?? ""));
    return { error: null, imported: null };
  }

  if (form.get("intent") === "discard-draft") {
    const draftId = int(form, "draftId");
    if (draftId) await deleteDraft(draftId);
    // From the list of drafts, through a fetcher; otherwise from the draft itself, which is gone now
    return form.get("from") === "list" ? { error: null, imported: null } : redirect("/recipes/import");
  }

  // Parsed again here rather than trusting the preview
  const allItems = await db.select({ name: schema.items.name, plural: schema.items.plural }).from(schema.items);
  const { recipe, errors } = parseRecipeText(text(form, "text"), allItems);
  if (errors.length || recipe.servingSize == null) return { error: "Bitte zuerst die Fehler im Text beheben.", imported: null };

  // Lines whose note was ticked in the preview to go on the shopping list
  const noteOnListLines = new Set(form.getAll("noteOnList").map(Number));
  const ingredients = recipe.ingredients.map((ing) => ({ ...ing, noteOnList: ing.note !== null && noteOnListLines.has(ing.line) }));
  const parsed = { ...recipe, servingSize: recipe.servingSize, ingredients };
  const draftId = int(form, "draftId");

  // "Änderungen speichern" on a draft reworking a recipe; "Als neues Rezept speichern" imports it like any other
  let saved;
  if (form.get("intent") === "update") {
    const recipeId = draftId ? (await getDraft(draftId))?.recipeId : null;
    if (!recipeId) return { error: "Diesen Entwurf gibt es nicht mehr: Er wurde gespeichert oder verworfen.", imported: null };
    saved = { ...await updateRecipeFromText(recipeId, parsed), updated: true };
  } else {
    saved = { ...await importRecipe(parsed), updated: false };
    // A variant of a recipe starts with its tags
    const originalId = draftId ? (await getDraft(draftId))?.recipeId : null;
    if (originalId) await copyRecipeTags(originalId, saved.id);
  }
  if (draftId) await deleteDraft(draftId);
  return { error: null, imported: { ...saved, name: recipe.name } };
}

// The text format, kept in view while typing (the placeholder disappears)
function FormatHelp() {
  return (
    <Card withBorder radius="md" p="md">
      <Title order={5} mb="xs">Format</Title>
      <Code block mb="sm">{PLACEHOLDER}</Code>
      <List size="sm" spacing={4}>
        <List.Item>
          Die Zahl sind die Portionen; <Code>---</Code> trennt Zutaten, Zubereitung und Anmerkungen.
          Die Überschriften <Code>Zutaten</Code>, <Code>Zubereitung</Code>, <Code>Anmerkungen</Code> gehen auch, ebenso <Code>4 Personen</Code>, <Code>4 Portionen</Code> und <Code>für 4</Code>
        </List.Item>
        <List.Item>Der Weblink unter dem Namen ist optional; er muss mit <Code>https://</Code> oder <Code>www.</Code> beginnen</List.Item>
        <List.Item>Zubereitung und Anmerkungen sind optional; in der Zubereitung geht Markdown</List.Item>
        <List.Item>Eine Menge ohne Einheit bedeutet Stück; eine Zeile ohne Menge hat keine</List.Item>
        <List.Item>Mengen: <Code>1,5</Code>, <Code>1.5</Code>, <Code>1/2</Code>, <Code>1 1/2</Code>, <Code>½</Code>; keine Bereiche</List.Item>
        <List.Item>Einheiten: {UNITS.map((u) => u.label).join(", ")}, auch ausgeschrieben (<Code>Esslöffel</Code>) oder auf Englisch (<Code>tbsp</Code>)</List.Item>
        <List.Item>Eine Anmerkung nach <Code> - </Code>, einem Komma oder in Klammern bleibt bei der Zutat: <Code>1 Zwiebel - gewürfelt</Code>. In der Vorschau ankreuzen, wenn sie beim Einkaufen wichtig ist, wie <Code>mind. 30% Fett</Code></List.Item>
        <List.Item>Anführungszeichen behalten Komma, Bindestrich oder Klammern im Namen: <Code>"Salz, Pfeffer"</Code></List.Item>
        <List.Item>Rezeptzeilen werden über Name oder Plural (ohne Anmerkung) vorhandenen Zutaten zugeordnet; unbekannte Namen werden neue Zutaten</List.Item>
      </List>
    </Card>
  );
}

// Opens the camera on a phone (or a file picker elsewhere) and lets Claude write the recipe text from the
// photos; several photos are pages of one recipe. The text is saved as a new draft, which then opens.
// Buttons rather than forms, since they sit inside the import form

// Asks Claude for a recipe or a change to the draft. Sends the text as it stands, which Claude's answer
// may replace; the form then starts afresh from the draft, so the textarea is read-only meanwhile.
function RecipeChat({ fetcher, draftId, chat, text, preferences }: {
  fetcher: FetcherWithComponents<Awaited<ReturnType<typeof action>>>;
  draftId: number | null;
  chat: ChatMessage[];
  text: string;
  preferences: string | null;
}) {
  const [message, setMessage] = useState("");
  const busy = fetcher.state !== "idle";
  const sent = busy ? String(fetcher.formData?.get("message") ?? "") : null;
  const error = !busy && fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  function send() {
    if (!message.trim() || busy) return;
    fetcher.submit({ intent: "chat", message, text, ...(draftId ? { draftId } : {}) }, { method: "post" });
    setMessage("");
  }

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        {chat.length === 0 && !sent && (
          <Text size="sm" c="dimmed">
            Claude ein Rezept schreiben lassen („etwas Schnelles mit Lauch und Linsen für 4“) und dann im Gespräch anpassen.
            Der Entwurf links lässt sich weiter von Hand bearbeiten; Claude sieht die Änderungen.
          </Text>
        )}
        {[...chat, ...(sent ? [{ role: "user" as const, content: sent }] : [])].map((m, i) =>
          m.role === "user"
            ? <Paper key={i} bg="var(--mantine-primary-color-light)" p="xs" radius="md" ml="xl" style={{ whiteSpace: "pre-wrap" }} fz="sm">{m.content}</Paper>
            : <div key={i}><Markdown>{m.content}</Markdown>{m.after != null && <ChatChanges before={m.before ?? ""} after={m.after} />}</div>,
        )}
        {sent && <Text size="sm" c="dimmed">Claude schreibt…</Text>}
        {error && <Text size="sm" c="red">{error}</Text>}
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Textarea
            aria-label="Nachricht an Claude"
            placeholder={chat.length ? "Was soll anders werden?" : "Was möchtest du kochen?"}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            onKeyDown={(e) => {
              // Enter alone makes a new line, as on a phone
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            autosize
            minRows={1}
            maxRows={6}
            style={{ flex: 1 }}
          />
          <ActionIcon size="lg" aria-label="Senden" onClick={send} loading={busy} disabled={!message.trim()}>
            <IconSend size={16} />
          </ActionIcon>
        </Group>
        <Preferences saved={preferences} />
      </Stack>
    </Card>
  );
}

// What a reply changed in the recipe, from the text sent with the turn, so edits by hand in between don't count
function ChatChanges({ before, after }: { before: string; after: string }) {
  const [open, setOpen] = useState(false);
  const diff = useMemo(() => diffVersions(before, after), [before, after]);
  return (
    <>
      <Button size="compact-xs" variant="subtle" onClick={() => setOpen((o) => !o)}>
        {open ? "Änderungen ausblenden" : `Änderungen zeigen (+${diff.added} −${diff.removed})`}
      </Button>
      <Collapse expanded={open}>
        <Paper withBorder p="xs" mt={4}><RecipeDiff lines={diff.lines} /></Paper>
      </Collapse>
    </>
  );
}

// The household's general preferences for the chat ("viel Gemüse, wenig Fleisch"), for all drafts
function Preferences({ saved }: { saved: string | null }) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(saved ?? "");
  const changed = value.trim() !== (saved ?? "");

  return (
    <div>
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconSettings size={14} />} onClick={() => setOpen((o) => !o)}>
        {saved ? "Vorlieben" : "Vorlieben festlegen"}
      </Button>
      <Collapse expanded={open}>
        <Stack gap="xs" mt="xs">
          <Textarea
            aria-label="Vorlieben"
            description="Gelten für alle Rezepte, die Claude hier schreibt, solange im Chat nichts anderes gewünscht wird."
            placeholder="Wir essen gerne gesund, mit viel Gemüse und natürlichen Zutaten. Fleisch ja, aber nicht oft."
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group>
            <Button
              size="xs"
              disabled={!changed}
              loading={fetcher.state !== "idle"}
              onClick={() => fetcher.submit({ intent: "save-preferences", preferences: value }, { method: "post" })}
            >
              Speichern
            </Button>
            {!changed && fetcher.data && <Text size="sm" c="dimmed">Gespeichert</Text>}
          </Group>
        </Stack>
      </Collapse>
    </div>
  );
}

// Drafts to pick up, shown while not editing one
function DraftList({ drafts }: { drafts: { id: number; name: string; updatedAt: string; recipeId: number | null }[] }) {
  if (drafts.length === 0) return null;
  return (
    <Card withBorder radius="md" p="md">
      <Title order={5} mb="xs">Entwürfe</Title>
      <Table>
        <Table.Tbody>
          {drafts.map((d) => <DraftRow key={d.id} {...d} />)}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function DraftRow({ id, name, updatedAt, recipeId }: { id: number; name: string; updatedAt: string; recipeId: number | null }) {
  const fetcher = useFetcher<typeof action>();
  if (fetcher.state !== "idle") return null;
  return (
    <Table.Tr>
      <Table.Td>
        <Anchor component={Link} to={`/recipes/import?draft=${id}`} size="sm">{name || "Ohne Titel"}</Anchor>
        {recipeId != null && <Badge size="xs" variant="light" ml={6}>Überarbeitung</Badge>}
      </Table.Td>
      <Table.Td c="dimmed" fz="sm"><LocalDateTime iso={updatedAt} /></Table.Td>
      <Table.Td style={{ width: 40 }}>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={`${name || "Entwurf ohne Titel"} verwerfen`}
          onClick={() => {
            if (confirm(`Entwurf „${name || "Ohne Titel"}“ verwerfen?`)) fetcher.submit({ intent: "discard-draft", draftId: id, from: "list" }, { method: "post" });
          }}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  );
}

// Discarding the open draft goes back to the empty form
function DiscardDraftButton({ id }: { id: number }) {
  const fetcher = useFetcher<typeof action>();
  return (
    <Button
      size="xs"
      variant="subtle"
      color="red"
      leftSection={<IconTrash size={14} />}
      loading={fetcher.state !== "idle"}
      onClick={() => {
        if (confirm("Diesen Entwurf verwerfen?")) fetcher.submit({ intent: "discard-draft", draftId: id }, { method: "post" });
      }}
    >
      Entwurf verwerfen
    </Button>
  );
}

// Saves the text a second after typing stops, and says whether it's saved
function useAutosave(draft: { id: number; text: string } | null, input: string) {
  const fetcher = useFetcher<typeof action>();
  const saved = useRef(draft?.text);

  useEffect(() => {
    if (!draft || input === saved.current) return;
    const timer = setTimeout(() => {
      saved.current = input;
      fetcher.submit({ intent: "save-draft", draftId: draft.id, text: input }, { method: "post" });
    }, 1000);
    return () => clearTimeout(timer);
  }, [input]);

  if (fetcher.state !== "idle") return "Speichert…";
  return input === saved.current ? "Gespeichert" : "Ungespeicherte Änderungen";
}

// Autosaves don't change anything else on the page
export function shouldRevalidate({ formData, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formData?.get("intent") === "save-draft") return false;
  return defaultShouldRevalidate;
}

// Lists the new items on top, and editing one comes back there, since this page is gone once left
const NEWEST_ITEMS = "/items?by=newest";

type NewItem = { id: number; name: string; storeId: number | null; defaultUnit: UnitKey | null };
type Names = { stores: { id: number; name: string }[]; shelves: { id: number; name: string }[]; items: { id: number; name: string }[] };

// Asks for a shelf, unit, plural and parent for all the new items at once, and saves the ticked ones.
// Like the item form, it renames plural names to their singular and otherwise only fills in what's still empty.
function SuggestForNewItems({ newItems, names, onShelved }: {
  newItems: NewItem[];
  names: Names;
  onShelved: (ids: number[]) => void;
}) {
  const suggest = useFetcher<typeof suggestAction>();
  const apply = useFetcher<typeof action>();
  const [unticked, setUnticked] = useState(() => new Set<number>());
  const applied = apply.data && "shelved" in apply.data ? apply.data.shelved : null;

  useEffect(() => {
    if (applied) onShelved(applied);
  }, [applied]);

  const nameOf = (list: { id: number; name: string }[], id: number | null) => list.find((x) => x.id === id)?.name;
  const suggestions = suggest.data && "suggestions" in suggest.data ? suggest.data.suggestions : null;
  // What each suggestion would fill in; items it has nothing new for are left out
  const rows = (suggestions ?? []).flatMap((s, i) => {
    const item = newItems[i];
    const store = item.storeId == null ? nameOf(names.stores, s.storeId) : undefined;
    const shelf = item.storeId == null || item.storeId === s.storeId ? nameOf(names.shelves, s.categoryId) : undefined;
    const changes = [
      s.singular && `umbenennen in ${s.singular}`,
      store && shelf ? `${store} › ${shelf}` : store ?? shelf,
      item.defaultUnit == null && s.defaultUnit && unitName(s.defaultUnit),
      s.plural && `Plural ${s.plural}`,
      s.parentId != null && `Variante von ${nameOf(names.items, s.parentId)}`,
    ].filter(Boolean);
    return changes.length ? [{ item, suggestion: s, changes }] : [];
  });
  const accepted = rows.filter((r) => !unticked.has(r.item.id)).map((r) => ({ itemId: r.item.id, ...r.suggestion }));

  if (applied) {
    return <Text size="sm" c="dimmed" mb="lg">Vorschläge gespeichert.</Text>;
  }
  return (
    <Card withBorder radius="md" p="md" mb="lg">
      <Group justify="space-between" mb={suggestions ? "sm" : 0}>
        <Text size="sm">Claude Regal, Einheit, Plural und Oberbegriff für die neuen Zutaten vorschlagen und Pluralnamen korrigieren lassen.</Text>
        <suggest.Form method="post" action="/items/suggest">
          {newItems.map((item) => (
            <span key={item.id}>
              <input type="hidden" name="name" value={item.name} />
              <input type="hidden" name="itemId" value={item.id} />
            </span>
          ))}
          <Button type="submit" size="xs" variant="light" leftSection={<IconSparkles size={14} />} loading={suggest.state !== "idle"}>
            Vorschlagen
          </Button>
        </suggest.Form>
      </Group>
      {suggest.data && "error" in suggest.data && <Text size="sm" c="red">{suggest.data.error}</Text>}
      {suggestions && rows.length === 0 && <Text size="sm" c="dimmed">Keine Vorschläge für diese Zutaten.</Text>}
      {rows.length > 0 && (
        <apply.Form method="post">
          <input type="hidden" name="intent" value="apply-suggestions" />
          <input type="hidden" name="accepted" value={JSON.stringify(accepted)} />
          <Table mb="sm">
            <Table.Tbody>
              {rows.map(({ item, changes }) => (
                <Table.Tr key={item.id}>
                  <Table.Td style={{ width: 30 }}>
                    <Checkbox
                      aria-label={`Vorschlag für ${item.name} übernehmen`}
                      checked={!unticked.has(item.id)}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setUnticked((prev) => {
                          const next = new Set(prev);
                          if (checked) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                    />
                  </Table.Td>
                  <Table.Td>{item.name}</Table.Td>
                  <Table.Td c="dimmed">{changes.join(" · ")}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {apply.data?.error && <Text size="sm" c="red" mb="xs">{apply.data.error}</Text>}
          <Button type="submit" size="xs" disabled={accepted.length === 0} loading={apply.state !== "idle"}>
            {accepted.length} von {rows.length} übernehmen
          </Button>
        </apply.Form>
      )}
    </Card>
  );
}

// Shown instead of the form once a recipe is imported
// Navigating to this same route keeps the component mounted, so the caller
// clears its text through onImportAnother
function Imported({ id, name, updated, newItems, storeName, names, onImportAnother }: {
  id: number;
  name: string;
  updated: boolean;
  newItems: NewItem[];
  storeName: string | null;
  names: Names;
  onImportAnother: () => void;
}) {
  // Items given a shelf by accepted suggestions
  const [shelved, setShelved] = useState<number[]>([]);
  const unsorted = newItems.filter((i) => !shelved.includes(i.id));

  return (
    <Container size="sm" py="xl">
      <Alert color="green" variant="light" icon={<IconCheck size={16} />} title={`„${name}“ ${updated ? "gespeichert" : "importiert"}`} mb="lg">
        {unsorted.length > 0 && (
          <>
            <Text size="sm" mb="xs">
              {unsorted.length === 1 ? "Diese neue Zutat hat" : `Diese ${unsorted.length} neuen Zutaten haben`}{" "}
              {storeName ? `noch kein Regal in ${storeName}` : "noch keinen Laden und kein Regal"},
              daher kann die Einkaufsliste sie nicht einsortieren:
            </Text>
            <List size="sm">
              {unsorted.map((item) => (
                <List.Item key={item.id}>
                  <Anchor component={Link} to={editItemPath(item.id, NEWEST_ITEMS)} size="sm">{item.name}</Anchor>
                </List.Item>
              ))}
            </List>
          </>
        )}
      </Alert>
      {newItems.length > 0 && <SuggestForNewItems newItems={newItems} names={names} onShelved={setShelved} />}
      <Group>
        <Button component={Link} to={`/recipes/${id}`}>Rezept öffnen</Button>
        <Button component={Link} to="/recipes/import" onClick={onImportAnother} variant="light" leftSection={<IconFileImport size={16} />}>
          Weiteres importieren
        </Button>
        {newItems.length > 0 && <Button component={Link} to={NEWEST_ITEMS} variant="subtle">Neueste Zutaten</Button>}
      </Group>
    </Container>
  );
}

// Identifies a ticked note across edits of the text, which move its line
const noteKey = (ing: ParsedIngredient) => `${itemKey(ing.name)}\n${ing.note}`;

export default function ImportRecipe(props: Route.ComponentProps) {
  // Opening another draft, or a chat turn, starts the form afresh from the saved text
  const { draft } = props.loaderData;
  return <ImportForm key={draft ? `${draft.id}-${draft.chat.length}` : "new"} {...props} />;
}

function ImportForm({ loaderData, actionData }: Route.ComponentProps) {
  const { allItems, recipeNames, allStores, allShelves, draft, draftGone, drafts, preferences, original } = loaderData;
  const [input, setInput] = useState(draft?.text ?? "");
  const saveStatus = useAutosave(draft, input);
  const chatFetcher = useFetcher<typeof action>();
  // ?chat, from the list of recipes, starts with the chat open
  const openChat = useSearchParams()[0].has("chat");
  const [chatOpen, setChatOpen] = useState(() => (draft?.chat.length ?? 0) > 0 || openChat);
  // A reworked recipe starts with the notes it puts on the shopping list ticked
  const [notesOnList, setNotesOnList] = useState(() => new Set<string>(original?.notesOnList));
  // Reworking a recipe, the preview can show what changed instead
  const [view, setView] = useState<"preview" | "changes">("preview");
  const changes = useMemo(() => (original && view === "changes" ? diffVersions(original.savedText, input) : null), [original, view, input]);
  const toggleNoteOnList = (ing: ParsedIngredient, checked: boolean) =>
    setNotesOnList((prev) => {
      const next = new Set(prev);
      if (checked) next.add(noteKey(ing));
      else next.delete(noteKey(ing));
      return next;
    });
  const { recipe, errors } = useMemo(() => parseRecipeText(input, allItems), [input, allItems]);
  const knownItems = useMemo(() => new Set(allItems.flatMap(itemKeys)), [allItems]);
  const errorLines = new Set(errors.flatMap((e) => (e.line != null ? [e.line] : [])));

  if (actionData?.imported) {
    const importAnother = () => {
      setInput("");
      setNotesOnList(new Set());
    };
    const names = { stores: allStores, shelves: allShelves, items: allItems };
    return <Imported {...actionData.imported} names={names} onImportAnother={importAnother} />;
  }

  const newItemCount = recipe.ingredients.filter((ing) => !knownItems.has(itemKey(ing.name))).length;
  // Keeping a reworked recipe's own name is fine
  const nameTaken = recipe.name !== "" && itemKey(recipe.name) !== itemKey(original?.name ?? "")
    && recipeNames.some((n) => itemKey(n) === itemKey(recipe.name));
  const canImport = input.trim() !== "" && errors.length === 0;

  return (
    <Container size="lg" py="xl">
      <Title mb="lg">{original ? `„${original.name}“ überarbeiten` : "Rezept importieren"}</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Form method="post">
          <Stack>
            {draftGone && (
              <Alert color="yellow" variant="light" py="xs">Diesen Entwurf gibt es nicht mehr: Er wurde importiert oder verworfen.</Alert>
            )}
            {draft ? (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Entwurf · {saveStatus}</Text>
                <Group gap="xs">
                  {!chatOpen && (
                    <Button variant="light" size="xs" leftSection={<IconMessageCircle size={16} />} onClick={() => setChatOpen(true)}>
                      Mit AI überarbeiten
                    </Button>
                  )}
                  <DiscardDraftButton id={draft.id} />
                </Group>
              </Group>
            ) : (
              input.trim() === "" && !chatOpen && <DraftList drafts={drafts} />
            )}
            {chatOpen && <RecipeChat fetcher={chatFetcher} draftId={draft?.id ?? null} chat={draft?.chat ?? []} text={input} preferences={preferences} />}
            <Textarea
              name="text"
              label="Rezepttext"
              description="Format siehe unten"
              placeholder={PLACEHOLDER}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              readOnly={chatFetcher.state !== "idle"}
              autosize
              minRows={16}
              autoFocus
              styles={{ input: TEXT_METRICS }}
              inputContainer={(children) => (
                <div style={{ position: "relative" }}>
                  {children}
                  {input !== "" && <LineGutter text={input} errorLines={errorLines} />}
                </div>
              )}
            />
            {draft && <input type="hidden" name="draftId" value={draft.id} />}
            {recipe.ingredients
              .filter((ing) => ing.note && notesOnList.has(noteKey(ing)))
              .map((ing) => <input key={ing.line} type="hidden" name="noteOnList" value={ing.line} />)}
            <FormError error={actionData?.error} />
            <Group>
              {original ? (
                <>
                  <SubmitButton name="intent" value="update" disabled={!canImport}>Änderungen speichern</SubmitButton>
                  <SubmitButton variant="light" disabled={!canImport}>Als neues Rezept speichern</SubmitButton>
                </>
              ) : (
                <SubmitButton disabled={!canImport}>Importieren</SubmitButton>
              )}
              {canImport && newItemCount > 0 && (
                <Text size="sm" c="dimmed">
                  Legt {newItemCount} {newItemCount === 1 ? "neue Zutat" : "neue Zutaten"} an
                </Text>
              )}
            </Group>
            <FormatHelp />
          </Stack>
        </Form>

        <Stack>
          {input.trim() !== "" && errors.length > 0 && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py="xs">
              <List size="sm">
                {errors.map((e, i) => (
                  <List.Item key={i}>{e.line != null && <b>Zeile {e.line}: </b>}{e.message}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          {nameTaken && (
            <Alert color="yellow" variant="light" py="xs">
              Es gibt schon ein Rezept namens „{recipe.name}“; {original ? "„Als neues Rezept speichern“" : "der Import"} legt ein zweites an.
            </Alert>
          )}

          {original && (
            <SegmentedControl
              value={view}
              onChange={(v) => setView(v as typeof view)}
              data={[{ value: "preview", label: "Vorschau" }, { value: "changes", label: "Änderungen" }]}
            />
          )}
          {changes ? (
            <Card withBorder radius="md" p="md">
              {changes.added + changes.removed === 0
                ? <Text size="sm" c="dimmed">Noch keine Änderungen gegenüber dem gespeicherten Rezept.</Text>
                : <RecipeDiff lines={changes.lines} />}
            </Card>
          ) : (
            <Card withBorder radius="md" p="md">
              <Title order={3}>{recipe.name || <Text span c="dimmed" inherit>Name</Text>}</Title>
              <Text size="sm" c="dimmed" mb="md">
                {recipe.servingSize ? `Für ${recipe.servingSize} Portionen` : "Portionen —"}
                {recipe.weblink && <> · <Weblink href={recipe.weblink} size="sm" /></>}
              </Text>

              <Title order={5} mb={4}>Zutaten</Title>
              <Table mb="md">
                <Table.Tbody>
                  {recipe.ingredients.map((ing) => (
                    <Table.Tr key={ing.line}>
                      <Table.Td c="dimmed" ta="right" style={{ width: 90, verticalAlign: "top" }}>{formatAmount(ing)}</Table.Td>
                      <Table.Td>
                        <IngredientName {...ing} noteControl={
                          <Checkbox size="xs" label="Anmerkung auf die Einkaufsliste" checked={notesOnList.has(noteKey(ing))}
                            onChange={(e) => toggleNoteOnList(ing, e.currentTarget.checked)} />
                        }>
                          {!knownItems.has(itemKey(ing.name)) && (
                            <>
                              <Badge size="xs" variant="light" color="orange" ml={6}>neue Zutat</Badge>
                              <PluralSuggestion name={ing.name} singular={likelySingular(ing.name, allItems)} />
                            </>
                          )}
                        </IngredientName>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {recipe.ingredients.length === 0 && (
                    <Table.Tr>
                      <Table.Td c="dimmed">Noch keine.</Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>

              <Title order={5} mb={4}>Zubereitung</Title>
              {recipe.instructions ? <Markdown>{recipe.instructions}</Markdown> : <Text size="sm" c="dimmed" mb="md">—</Text>}

              <Title order={5} mb={4}>Anmerkungen</Title>
              {recipe.comments
                ? <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{recipe.comments}</Text>
                : <Text size="sm" c="dimmed">—</Text>}
            </Card>
          )}
        </Stack>
      </SimpleGrid>
    </Container>
  );
}
