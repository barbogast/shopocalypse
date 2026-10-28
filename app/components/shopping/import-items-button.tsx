import { Alert, Badge, Button, Group, List, Modal, Stack, Table, Text, Textarea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertCircle, IconFileImport, IconPlus } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Form, useActionData } from "react-router";
import { FormError } from "~/components/form-error";
import { IngredientName } from "~/components/ingredient-name";
import { LineGutter, TEXT_METRICS } from "~/components/line-gutter";
import { PluralSuggestion } from "~/components/plural-suggestion";
import { SubmitButton } from "~/components/submit-button";
import { itemKey, itemKeys, likelySingular } from "~/item-names";
import { parseItemsText } from "~/recipe-import";
import type { action } from "~/routes/shopping";
import { formatAmount } from "~/units";

const IMPORT_PLACEHOLDER = `500 g Tomaten
2 Zwiebeln
Salz
200 ml Sahne - mind. 30% Fett`;

// Adds several items at once from text, one per line in the recipe import's ingredient format,
// with a preview of what each line becomes. Notes go on the list with the item.
export function ImportItemsButton({ items }: { items: { id: number; name: string; plural: string | null }[] }) {
  const [opened, modal] = useDisclosure(false);
  const [input, setInput] = useState("");
  const actionData = useActionData<typeof action>();
  const { items: parsed, errors } = useMemo(() => parseItemsText(input, items), [input, items]);
  const knownItems = useMemo(() => new Set(items.flatMap(itemKeys)), [items]);
  const errorLines = new Set(errors.flatMap((e) => (e.line != null ? [e.line] : [])));
  const newItemCount = parsed.filter((i) => !knownItems.has(itemKey(i.name))).length;
  const canImport = parsed.length > 0 && errors.length === 0;

  // Done once the items are on the list
  useEffect(() => {
    if (actionData && "itemsImported" in actionData) {
      modal.close();
      setInput("");
    }
  }, [actionData]);

  return (
    <>
      <Button variant="subtle" size="compact-sm" mt="xs" leftSection={<IconFileImport size={14} />} onClick={modal.open}>
        Paste items
      </Button>
      <Modal opened={opened} onClose={modal.close} title="Paste items" size="lg">
        {/* The preview stays outside the form, since its plural suggestions are forms of their own */}
        <Stack>
          <Form method="post" id="import-items">
            <input type="hidden" name="intent" value="import-items" />
            <Textarea
              name="text"
              description="One item per line, like a recipe's ingredients: quantity, unit, name, and a note after “ - ”"
              placeholder={IMPORT_PLACEHOLDER}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              autosize
              minRows={6}
              data-autofocus
              styles={{ input: TEXT_METRICS }}
              inputContainer={(children) => (
                <div style={{ position: "relative" }}>
                  {children}
                  {input !== "" && <LineGutter text={input} errorLines={errorLines} />}
                </div>
              )}
            />
          </Form>
          {errors.length > 0 && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py="xs">
              <List size="sm">
                {errors.map((e, i) => (
                  <List.Item key={i}>{e.line != null && <b>Line {e.line}: </b>}{e.message}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          {parsed.length > 0 && (
            <Table>
              <Table.Tbody>
                {parsed.map((ing) => (
                  <Table.Tr key={ing.line}>
                    <Table.Td c="dimmed" ta="right" style={{ width: 90, verticalAlign: "top" }}>{formatAmount(ing)}</Table.Td>
                    <Table.Td>
                      <IngredientName {...ing}>
                        {!knownItems.has(itemKey(ing.name)) && (
                          <>
                            <Badge size="xs" variant="light" color="orange" ml={6}>new item</Badge>
                            <PluralSuggestion name={ing.name} singular={likelySingular(ing.name, items)} />
                          </>
                        )}
                      </IngredientName>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          <FormError error={actionData && "importError" in actionData ? actionData.importError : null} />
          <Group>
            <SubmitButton form="import-items" disabled={!canImport} leftSection={<IconPlus size={16} />}>
              Add {parsed.length || ""} item{parsed.length === 1 ? "" : "s"}
            </SubmitButton>
            {canImport && newItemCount > 0 && (
              <Text size="sm" c="dimmed">Creates {newItemCount} new item{newItemCount === 1 ? "" : "s"}</Text>
            )}
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
