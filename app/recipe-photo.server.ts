import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { UNITS } from "~/units";

const MODEL = "claude-opus-5-5";

// Shown to the model as the format to write; recipe-photo.test.ts checks it still parses
export const EXAMPLE = `Kartoffelsuppe
4
---
1 kg Kartoffeln - mehligkochend
2 Zwiebeln - gewürfelt
1 l Gemüsebrühe
200 ml Sahne
1 Bund Petersilie
"Salz, Pfeffer"
---
1. Kartoffeln und Zwiebeln schälen und würfeln.
2. In der Brühe 20 Minuten **weich kochen**, dann pürieren.
3. Sahne unterrühren, abschmecken.
---
Hält sich 2 Tage im Kühlschrank.`;

const SYSTEM = `You transcribe recipes from photos (cookbook pages, printouts, handwritten cards) into a plain-text format for a shopping app.
Write exactly this format, nothing else:

${EXAMPLE}

- Line 1: the recipe's name. Line 2: the number of servings as a bare number. If the recipe doesn't say, estimate it and say so in the comments.
- Then "---" and one ingredient per line: quantity, unit, name, then optionally " - " and a note (preparation, variety, size).
- Quantities: whole numbers, decimals ("1.5") or fractions ("1/2", "1 1/2"). No ranges: for "2-3" write the lower number and put "2-3" in the note.
- Units, only these: ${UNITS.map((u) => u.label).join(", ")}. A count of pieces has no unit ("2 Zwiebeln"). Convert other units to one of these where it's exact (cups and ounces to ml or g); otherwise leave the line without a quantity and put the original amount in the note. An ingredient without an amount ("Salz") is just its name.
- Ingredient names: the plain item you'd buy, without the amount, preparation or brand. Quote a name that contains a comma, dash or parentheses.
- Then "---" and the instructions in markdown, as numbered steps if the recipe has steps.
- Then, only if there's something worth keeping (tips, storage, sources, your estimates or anything you couldn't read), "---" and the comments as plain text.
- Keep the recipe's own language; don't translate. Leave out section headings from the photo ("Zutaten", "Zubereitung"); use "---" instead.
- Several photos are pages of the same recipe, in order.
- Write what's printed; mark words you can't read with [?] rather than guessing.`;

const ResponseSchema = z.object({ text: z.string() });

export type Photo = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string };

// One request for all the photos of one recipe
export async function transcribeRecipe(photos: Photo[]): Promise<{ text: string } | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Reading photos needs ANTHROPIC_API_KEY to be set." };
  if (photos.length === 0) return { error: "Take or pick a photo first." };

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ResponseSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          ...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.base64 } })),
          { type: "text" as const, text: photos.length === 1 ? "Transcribe this recipe." : "Transcribe this recipe from these pages." },
        ],
      }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { error: "The ANTHROPIC_API_KEY was refused." };
    if (error instanceof Anthropic.RateLimitError) return { error: "Too many requests at once; try again in a minute." };
    if (error instanceof Anthropic.BadRequestError) return { error: "That photo couldn't be read; try a smaller or sharper one." };
    if (error instanceof Anthropic.APIError) return { error: `Reading the photo failed (${error.status ?? "no connection"}).` };
    throw error;
  }
  if (response.stop_reason === "refusal" || !response.parsed_output) return { error: "No recipe found in the photo; try again." };
  return { text: response.parsed_output.text.trim() };
}
