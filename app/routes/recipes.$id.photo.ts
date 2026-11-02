import { getRecipePhoto } from "~/db/recipe-photos.server";
import type { Route } from "./+types/recipes.$id.photo";

// The recipe's photo as an image, or with ?size=thumbnail its small square. Linked with
// ?v=<upload time>, so each URL always shows the same photo and browsers may keep it;
// private, since it's behind the password
export async function loader({ params, request }: Route.LoaderArgs) {
  const size = new URL(request.url).searchParams.get("size") === "thumbnail" ? "thumbnail" : "full";
  const photo = await getRecipePhoto(Number(params.id), size);
  if (!photo) throw new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
