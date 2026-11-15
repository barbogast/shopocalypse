import { ColorSchemeScript, Indicator, MantineProvider, mantineHtmlProps } from "@mantine/core";
import "@mantine/core/styles.css";
import "./view-transitions.css";
import {
  IconCalendarEvent,
  IconChefHat,
  IconListDetails,
  IconShoppingCart,
} from "@tabler/icons-react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  type ShouldRevalidateFunctionArgs,
  useFetchers,
  useRouteLoaderData,
} from "react-router";
import { useSyncExternalStore } from "react";
import { count, eq } from "drizzle-orm";
import { checkPassword } from "./auth.server";
import { db } from "./db/client";
import { getActiveList } from "./db/shopping.server";
import * as schema from "./db/schema";
import * as outbox from "./tick-outbox";
import { DevMarker } from "./components/dev-marker";
import { NewVersionBar, VersionCheckProvider, VersionFooter } from "./components/version-footer";
import type { Route } from "./+types/root";

const NAV_ITEMS = [
  { to: "/", label: "Speiseplan", icon: IconCalendarEvent, end: true, badge: "scheduled" },
  { to: "/recipes", label: "Rezepte", icon: IconChefHat, end: false },
  { to: "/shopping", label: "Einkaufsliste", icon: IconShoppingCart, end: false, badge: "unbought" },
  { to: "/items", label: "Zutaten", icon: IconListDetails, end: false },
] as const;

// Runs before every loader and action, so no request gets past without the password
export const middleware: Route.MiddlewareFunction[] = [
  ({ request }) => {
    const denied = checkPassword(request);
    if (denied) return denied;
  },
];

// For the nav's badges. The list's rows rather than a count, so the badge can
// follow ticks still in the outbox, like the list itself does.
export async function loader() {
  const activeList = await getActiveList();
  const listItems = activeList
    ? await db
      .select({ id: schema.shoppingListItems.id, bought: schema.shoppingListItems.bought })
      .from(schema.shoppingListItems)
      .where(eq(schema.shoppingListItems.shoppingListId, activeList.id))
    : [];
  const [{ scheduled }] = await db.select({ scheduled: count() }).from(schema.mealSchedule);
  return { listItems, scheduled };
}

// Ticks don't reload the list either (see the shopping route); the badge
// follows them through the outbox
export function shouldRevalidate({ formData, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const intent = formData?.get("intent");
  if (intent === "tick" || intent === "untick") return false;
  return defaultShouldRevalidate;
}

function useBadgeCounts() {
  // Missing when the root loader failed and the error page shows
  const data = useRouteLoaderData<typeof loader>("root");
  const entries = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getServerSnapshot);
  const fetchers = useFetchers();
  const listItems = outbox.withPendingChanges(outbox.applyEntries(data?.listItems ?? [], entries), fetchers);
  return {
    scheduled: data?.scheduled ?? 0,
    unbought: listItems.filter((i) => !i.bought).length,
  };
}

function Nav() {
  const counts = useBadgeCounts();
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "calc(64px + env(safe-area-inset-bottom))",
      paddingBottom: "env(safe-area-inset-bottom)",
      display: "flex", borderTop: "1px solid var(--mantine-color-gray-3)",
      background: "var(--mantine-color-body)", zIndex: 100,
    }}>
      {NAV_ITEMS.map((navItem) => {
        const { to, label, icon: Icon, end } = navItem;
        const badge = "badge" in navItem ? counts[navItem.badge] : 0;
        return (
          <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 2,
            fontSize: 11, textDecoration: "none",
            color: isActive ? "var(--mantine-color-blue-6)" : "var(--mantine-color-gray-6)",
          })}>
            <Indicator label={badge} size={16} disabled={!badge} offset={2} zIndex={1}
              styles={{ indicator: { fontSize: 10, fontWeight: 600, padding: "0 4px" } }}>
              <Icon size={24} stroke={1.5} style={{ display: "block" }} />
            </Indicator>
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Makes the site installable as an app; the files are static, so outside the password */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Meta />
        <Links />
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider>
          <DevMarker />
          <VersionCheckProvider>
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
              <NewVersionBar />
              {/* The safe-area inset keeps the nav clear of the phone's home bar when installed */}
              {/* --page-bottom-bar is set by pages with a bar of their own above the nav */}
              <main style={{ flex: 1, paddingBottom: "calc(70px + env(safe-area-inset-bottom) + var(--page-bottom-bar, 0px))" }}>
                {children}
                <VersionFooter />
              </main>
              <Nav />
            </div>
          </VersionCheckProvider>
        </MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Hoppla!";
  let details = "Ein unerwarteter Fehler ist aufgetreten.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Fehler";
    details =
      error.status === 404
        ? "Die Seite wurde nicht gefunden."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
