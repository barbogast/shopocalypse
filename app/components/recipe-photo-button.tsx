import { Button, Group, Text } from "@mantine/core";
import { IconCamera } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { resizePhoto } from "~/image-resize";
import type { action } from "~/routes/recipes.import";

// Reads a recipe from photos through the import page, which then opens it as a draft.
// Posts there explicitly, so it also works from the list of recipes.
export function RecipePhotoButton({ hasUnsavedText = false }: { hasUnsavedText?: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const input = useRef<HTMLInputElement>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setResizing(true);
    setResizeError(null);
    try {
      const form = new FormData();
      form.set("intent", "transcribe-photo");
      for (const file of files) form.append("photo", await resizePhoto(file), "photo.jpg");
      fetcher.submit(form, { method: "post", action: "/recipes/import", encType: "multipart/form-data" });
    } catch {
      setResizeError("Das Foto konnte nicht geöffnet werden.");
    } finally {
      setResizing(false);
    }
  }

  return (
    <Group gap="sm">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])];
          e.currentTarget.value = "";
          upload(files);
        }}
      />
      <Button
        variant="light"
        leftSection={<IconCamera size={16} />}
        loading={resizing || fetcher.state !== "idle"}
        onClick={() => {
          if (hasUnsavedText && !confirm("Den hier eingegebenen Text durch den vom Foto ersetzen?")) return;
          input.current?.click();
        }}
      >
        Vom Foto
      </Button>
      {(resizeError ?? fetcher.data?.error) && <Text size="sm" c="red">{resizeError ?? fetcher.data?.error}</Text>}
    </Group>
  );
}
