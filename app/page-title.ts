// Every page's <title>. Dev builds say so up front, so the tab can't be
// mistaken for production.
export function pageTitle(page?: string) {
  const title = page ? `${page} – Shopocalypse` : "Shopocalypse";
  return import.meta.env.DEV ? `DEV · ${title}` : title;
}
