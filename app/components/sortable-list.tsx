import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { ActionIcon } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useFetcher } from "react-router";
import { inOrder, moved } from "~/reorder";

// A list reordered by dragging each row's grip (on phones: hold it briefly, then drag);
// the grip also moves a row with the keyboard (space, arrow keys, space). Calls
// onReorder with all ids in their new order.
export function SortableList<T>({ items, idOf, onReorder, children }: {
  items: T[];
  idOf: (item: T) => number;
  onReorder: (ids: number[]) => void;
  // Renders a row, placing the grip where it belongs in the row's layout
  children: (item: T, index: number, grip: ReactNode) => ReactNode;
}) {
  return (
    <DragDropProvider
      modifiers={(defaults) => [...defaults, RestrictToVerticalAxis]}
      onDragEnd={({ operation, canceled }) => {
        const { source } = operation;
        if (canceled || !isSortable(source) || source.initialIndex === source.index) return;
        onReorder(moved(items.map(idOf), source.initialIndex, source.index));
      }}
    >
      {items.map((item, index) => (
        <SortableRow key={idOf(item)} id={idOf(item)} index={index}>
          {(grip) => children(item, index, grip)}
        </SortableRow>
      ))}
    </DragDropProvider>
  );
}

function SortableRow({ id, index, children }: { id: number; index: number; children: (grip: ReactNode) => ReactNode }) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });
  const grip = (
    // touch-action: dragging the grip moves the row instead of scrolling the page
    <ActionIcon ref={handleRef} variant="subtle" color="gray" aria-label="Verschieben"
      style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none", flexShrink: 0 }}>
      <IconGripVertical size={16} />
    </ActionIcon>
  );
  return (
    <div ref={ref} style={isDragging ? { position: "relative", zIndex: 1 } : undefined}>
      {children(grip)}
    </div>
  );
}

// The items in their new order while a reorder is being saved (so a dropped row stays
// where it was dropped), and the function that saves one: posts the given intent with
// the ids as "order" to the page's action
export function useReorder<T>(items: T[], idOf: (item: T) => number, intent: string) {
  const fetcher = useFetcher();
  const pending = fetcher.formData?.get("intent") === intent ? fetcher.formData.get("order") : null;
  const ordered = inOrder(items, idOf, typeof pending === "string" ? pending.split(",").map(Number) : null);
  const reorder = (ids: number[]) => fetcher.submit({ intent, order: ids.join(",") }, { method: "post" });
  return [ordered, reorder] as const;
}
