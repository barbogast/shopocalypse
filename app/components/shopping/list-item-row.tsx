import { ActionIcon, Badge, Button, Group, NumberInput, Popover, Select, Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { IconCheck, IconChefHat, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { FormError } from "~/components/form-error";
import type { clientAction, ListItem } from "~/routes/shopping";
import { type Amount, DEFAULT_UNIT, formatAmounts, nameForAmounts, parseAmounts, UNIT_OPTIONS } from "~/units";

// One line of the list. Ticking and removing go through a fetcher, so the row
// updates at once instead of waiting for the server and a reload of the list.
export function ListItemRow({ item, usedIn }: { item: ListItem; usedIn: string[] | undefined }) {
  const fetcher = useFetcher<typeof clientAction>();
  const ticked = item.bought;
  // Shown at once while a new amount is on its way
  const sentAmounts = fetcher.formData?.get("intent") === "set-amounts" ? parseAmounts(fetcher.formData) : null;
  const amounts = sentAmounts && "amounts" in sentAmounts ? sentAmounts.amounts : item.amounts;

  return (
    <Table.Tr opacity={ticked ? 0.5 : 1}>
      {/* Right-aligned and level with the name, so the two read as one phrase: "650 g Karotten" */}
      <Table.Td style={{ width: 110, verticalAlign: "top" }} ta="right">
        <AmountsEditor item={item} amounts={amounts} />
      </Table.Td>
      <Table.Td pl={item.isVariant ? "xl" : undefined}>
        <Group gap={4} wrap="nowrap">
          <Text td={ticked ? "line-through" : undefined}>
            {nameForAmounts({ name: item.itemName, plural: item.itemPlural }, amounts)}
          </Text>
          {item.source === "manual" && (
            <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>manuell</Badge>
          )}
          {/* Which meals need it, on request only, so it doesn't crowd the list */}
          {usedIn && (
            <Popover position="bottom-start" shadow="sm">
              <Popover.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Mahlzeiten mit ${item.itemName}`}>
                  <IconChefHat size={14} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                {usedIn.map((name) => <Text key={name} size="sm">{name}</Text>)}
              </Popover.Dropdown>
            </Popover>
          )}
        </Group>
        {item.notes.map((n) => (
          <Text key={n.note} size="sm" c="dimmed">
            {n.amounts.length > 0 && `${formatAmounts(n.amounts)} `}{n.note}
          </Text>
        ))}
        <FormError error={fetcher.data && "removeError" in fetcher.data ? fetcher.data.removeError : null} mt="xs" />
      </Table.Td>
      <Table.Td style={{ width: 60 }}>
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={item.id} />
          {!ticked ? (
            <Button type="submit" name="intent" value="tick" size="xs" color="green" px={6} aria-label={`${item.itemName} abhaken`}>
              <IconCheck size={14} />
            </Button>
          ) : (
            <Button type="submit" name="intent" value="untick" size="xs" variant="subtle">Zurück</Button>
          )}
        </fetcher.Form>
      </Table.Td>
      <Table.Td style={{ width: 32 }}>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="remove-item" />
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" size="xs" variant="subtle" color="red" px={4} aria-label={`${item.itemName} entfernen`}>
            <IconTrash size={12} />
          </Button>
        </fetcher.Form>
      </Table.Td>
    </Table.Tr>
  );
}

// The amount, tapped to change it: one quantity and unit per kind it has (e.g. "2 Stk. + 200 g"),
// and another unit on request. An emptied quantity takes that unit off.
function AmountsEditor({ item, amounts }: { item: ListItem; amounts: Amount[] }) {
  const fetcher = useFetcher<typeof clientAction>();
  const [opened, setOpened] = useState(false);
  const [fields, setFields] = useState<{ quantity: string | number; unit: string | null }[]>([]);
  const sent = useRef(false);
  const error = fetcher.data && "amountsError" in fetcher.data ? fetcher.data.amountsError : null;
  const blank = () => ({ quantity: "", unit: item.defaultUnit ?? DEFAULT_UNIT });

  const open = () => {
    setFields(amounts.length ? amounts.map((a) => ({ quantity: a.quantity ?? "", unit: a.unit })) : [blank()]);
    setOpened(true);
  };

  // Closes once saved; stays open on an error, so it can be fixed
  useEffect(() => {
    if (fetcher.state === "submitting") sent.current = true;
    if (fetcher.state === "idle" && sent.current) {
      sent.current = false;
      if (!error) setOpened(false);
    }
  }, [fetcher.state]);

  const setField = (i: number, change: Partial<(typeof fields)[number]>) =>
    setFields((all) => all.map((f, j) => (j === i ? { ...f, ...change } : f)));

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" trapFocus>
      <Popover.Target>
        <UnstyledButton onClick={() => (opened ? setOpened(false) : open())} aria-label={`Menge von ${item.itemName} ändern`}>
          <Text c="dimmed">{formatAmounts(amounts)}</Text>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="set-amounts" />
          <input type="hidden" name="id" value={item.id} />
          <Stack gap="xs">
            {fields.map((f, i) => (
              <Group key={i} gap="xs" wrap="nowrap">
                <NumberInput name="quantity" aria-label="Menge" value={f.quantity} onChange={(quantity) => setField(i, { quantity })}
                  min={0} decimalScale={2} decimalSeparator="," placeholder="—" data-autofocus={i === 0 || undefined} style={{ width: 80 }} />
                <Select name="unit" aria-label="Einheit" data={UNIT_OPTIONS} value={f.unit} onChange={(unit) => setField(i, { unit })}
                  comboboxProps={{ withinPortal: false }} style={{ width: 110 }} />
              </Group>
            ))}
            <Group gap="xs" justify="space-between">
              <Button variant="subtle" size="xs" px={4} leftSection={<IconPlus size={14} />} onClick={() => setFields((all) => [...all, blank()])}>
                Einheit
              </Button>
              <Button type="submit" size="xs" loading={fetcher.state !== "idle"}>Speichern</Button>
            </Group>
            <FormError error={error} />
          </Stack>
        </fetcher.Form>
      </Popover.Dropdown>
    </Popover>
  );
}
