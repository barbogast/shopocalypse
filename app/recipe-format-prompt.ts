import { UNITS } from "~/units";

// The import format as explained to the model, shared by the photo transcription and the recipe chat.
// It's the format the app writes recipes out in (recipeToText), so a chat about an existing recipe
// only changes what was asked for; recipe-photo.test.ts checks the example still matches it.

export const EXAMPLE = `Kartoffelsuppe
4
https://example.com/kartoffelsuppe

Zutaten
1 kg Kartoffeln - mehligkochend
2 Zwiebeln - gewürfelt
1,5 l Gemüsebrühe
200 ml Sahne
1 Bund Petersilie
"Salz, Pfeffer"

Zubereitung
1. Kartoffeln und Zwiebeln schälen und würfeln.
2. In der Brühe 20 Minuten **weich kochen**, dann pürieren.
3. Sahne unterrühren, abschmecken.

Anmerkungen
Hält sich 2 Tage im Kühlschrank.`;

export const FORMAT_RULES = `${EXAMPLE}

- Line 1: the recipe's name. Line 2: the number of servings as a bare number. Line 3, only if the recipe has one: its weblink.
- Then a blank line, "Zutaten" and one ingredient per line: quantity, unit, name, then optionally " - " and a note (preparation, variety, size).
- Quantities: whole numbers or decimals with a comma ("1,5", "0,5"), not fractions. No ranges: for "2-3" write the lower number and put "2-3" in the note.
- Units, only these: ${UNITS.map((u) => u.label).join(", ")}. A count of pieces has no unit ("2 Zwiebeln"). Convert other units to one of these where it's exact (cups and ounces to ml or g); otherwise leave the line without a quantity and put the original amount in the note. An ingredient without an amount ("Salz") is just its name.
- Ingredient names: the plain item you'd buy, without the amount, preparation or brand. Quote a name that contains a comma, dash or parentheses. Each item only once: combine two lines for the same item into one.
- Then a blank line, "Zubereitung" and the instructions in markdown, as numbered steps if the recipe has steps.
- Then, only if there's something worth keeping, a blank line, "Anmerkungen" and the comments as plain text.
- No other headings, and no "Zutaten", "Zubereitung" or "Anmerkungen" line inside the instructions or comments.`;
