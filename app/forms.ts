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

// An http(s) URL ("https://" is added when the scheme is left off), or undefined
// when it isn't a web address. Other schemes are refused because the value ends
// up in a link's href (javascript: would run).
export function webUrl(value: string): string | undefined {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  if (!URL.canParse(withScheme)) return undefined;
  const url = new URL(withScheme);
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
}

// webUrl for a form field, or null when empty
export function optionalUrl(form: FormData, name: string): string | null | undefined {
  const value = text(form, name);
  return value ? webUrl(value) : null;
}

// The items view to go back to after editing an item ("/items?by=newest"), or "/items".
// Only the items list is accepted, so the parameter can't redirect anywhere else.
export function itemsPath(value: string | null): string {
  return value && /^\/items(\?|$)/.test(value) ? value : "/items";
}

// Link to edit an item that comes back to the given items view
export function editItemPath(id: number, returnTo: string): string {
  return `/items/${id}?returnTo=${encodeURIComponent(returnTo)}`;
}
