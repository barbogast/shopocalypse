import { UNITS } from "~/units";

// The import format as explained to the model, shared by the photo transcription and the recipe chat

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

export const FORMAT_RULES = `${EXAMPLE}

- Line 1: the recipe's name. Line 2: the number of servings as a bare number.
- Then "---" and one ingredient per line: quantity, unit, name, then optionally " - " and a note (preparation, variety, size).
- Quantities: whole numbers, decimals ("1.5") or fractions ("1/2", "1 1/2"). No ranges: for "2-3" write the lower number and put "2-3" in the note.
- Units, only these: ${UNITS.map((u) => u.label).join(", ")}. A count of pieces has no unit ("2 Zwiebeln"). Convert other units to one of these where it's exact (cups and ounces to ml or g); otherwise leave the line without a quantity and put the original amount in the note. An ingredient without an amount ("Salz") is just its name.
- Ingredient names: the plain item you'd buy, without the amount, preparation or brand. Quote a name that contains a comma, dash or parentheses. Each item only once: combine two lines for the same item into one.
- Then "---" and the instructions in markdown, as numbered steps if the recipe has steps.
- Then, only if there's something worth keeping, "---" and the comments as plain text.
- No section headings ("Zutaten", "Zubereitung"); use "---" instead.`;
