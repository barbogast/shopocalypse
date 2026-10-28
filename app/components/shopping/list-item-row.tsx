import { ActionIcon, Badge, Button, Group, Popover, Table, Text } from "@mantine/core";
import { IconCheck, IconChefHat, IconTrash } from "@tabler/icons-react";
import { useFetcher } from "react-router";
import { FormError } from "~/components/form-error";
import type { clientAction, ListItem } from "~/routes/shopping";
import { formatAmounts, nameForAmounts } from "~/units";

// One line of the list. Ticking and removing go through a fetcher, so the row
// updates at once instead of waiting for the server and a reload of the list.
export function ListItemRow({ item, usedIn }: { item: ListItem; usedIn: string[] | undefined }) {
  const fetcher = useFetcher<typeof clientAction>();
  const ticked = item.bought;

  return (
    <Table.Tr opacity={ticked ? 0.5 : 1}>
      {/* Right-aligned and level with the name, so the two read as one phrase: "650 g Karotten" */}
      <Table.Td style={{ width: 110, verticalAlign: "top" }} ta="right">
        <Text c="dimmed">{formatAmounts(item.amounts)}</Text>
      </Table.Td>
      <Table.Td pl={item.isVariant ? "xl" : undefined}>
        <Group gap={4} wrap="nowrap">
          <Text td={ticked ? "line-through" : undefined}>
            {nameForAmounts({ name: item.itemName, plural: item.itemPlural }, item.amounts)}
          </Text>
          {/* Which meals need it, on request only, so it doesn't crowd the list */}
          {usedIn && (
            <Popover position="bottom-start" shadow="sm">
              <Popover.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Meals using ${item.itemName}`}>
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
        {item.source === "manual" && (
          <Badge size="xs" variant="outline" color="gray">manual</Badge>
        )}
        <FormError error={fetcher.data && "removeError" in fetcher.data ? fetcher.data.removeError : null} mt="xs" />
      </Table.Td>
      <Table.Td style={{ width: 60 }}>
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={item.id} />
          {!ticked ? (
            <Button type="submit" name="intent" value="tick" size="xs" color="green" px={6} aria-label={`Tick off ${item.itemName}`}>
              <IconCheck size={14} />
            </Button>
          ) : (
            <Button type="submit" name="intent" value="untick" size="xs" variant="subtle">Undo</Button>
          )}
        </fetcher.Form>
      </Table.Td>
      <Table.Td style={{ width: 32 }}>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="remove-item" />
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" size="xs" variant="subtle" color="red" px={4} aria-label={`Remove ${item.itemName}`}>
            <IconTrash size={12} />
          </Button>
        </fetcher.Form>
      </Table.Td>
    </Table.Tr>
  );
}
