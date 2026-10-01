// Small readers for form fields. Number("") is 0 and Number("x") is NaN, so
// reading ids and counts with Number() alone lets bad input through.

// A positive whole number, or null when the field is missing or anything else
export function int(form: FormData, name: string): number | null {
  const value = Number(form.get(name));
  return Number.isInteger(value) && value >= 1 ? value : null;
}

// Trimmed text; empty when the field is missing
export function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

// Trimmed text, or null when empty
export function optionalText(form: FormData, name: string): string | null {
  return text(form, name) || null;
}
