import { Button, Group, Image, Stack, Text } from "@mantine/core";
import { IconPhoto, IconPhotoX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { photoThumbnail, resizePhoto } from "~/image-resize";
import { confirmFirst } from "~/forms";

// The photo of the dish on the recipe page, with buttons to add, replace or remove it.
// Not the photos a recipe is read from: those aren't kept.
// An image pasted on the page (outside text fields) is uploaded too.
export function DishPhoto({ recipeId, url }: { recipeId: number; url: string | null }) {
  const fetcher = useFetcher<{ photoError?: string } | null>();
  const input = useRef<HTMLInputElement>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const action = `/recipes/${recipeId}`;
  const uploading = resizing || (fetcher.state !== "idle" && fetcher.formData?.get("intent") === "set-photo");
  const removing = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "remove-photo";
  const error = resizeError ?? fetcher.data?.photoError;

  // Pasting an image anywhere on the page uploads it, e.g. one copied from a recipe website.
  // Pastes into text fields are left alone, as are pastes without an image
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      if (url && !confirm("Das Foto durch das eingefügte ersetzen?")) return;
      upload(file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  async function upload(file: File | undefined) {
    if (!file) return;
    setResizing(true);
    setResizeError(null);
    try {
      const form = new FormData();
      form.set("intent", "set-photo");
      form.set("photo", await resizePhoto(file), "photo.jpg");
      form.set("thumbnail", await photoThumbnail(file), "thumbnail.jpg");
      fetcher.submit(form, { method: "post", action, encType: "multipart/form-data" });
    } catch {
      setResizeError("Das Foto konnte nicht geöffnet werden.");
    } finally {
      setResizing(false);
    }
  }

  return (
    <Stack gap="xs" mb="lg">
      {/* No capture attribute: phones then offer the gallery as well as the camera */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          upload(file);
        }}
      />
      {url && <Image src={url} alt="" radius="md" mah={360} fit="cover" />}
      <Group gap="xs">
        <Button variant="light" size="xs" leftSection={<IconPhoto size={14} />} loading={uploading}
          onClick={() => input.current?.click()}>
          {url ? "Foto ändern" : "Foto hinzufügen"}
        </Button>
        {url && (
          <fetcher.Form method="post" action={action} onSubmit={confirmFirst("Foto entfernen?")}>
            <input type="hidden" name="intent" value="remove-photo" />
            <Button type="submit" variant="subtle" color="red" size="xs" leftSection={<IconPhotoX size={14} />} loading={removing}>
              Foto entfernen
            </Button>
          </fetcher.Form>
        )}
      </Group>
      {error && <Text size="sm" c="red">{error}</Text>}
    </Stack>
  );
}
