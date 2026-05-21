import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import {
  IconCalendarEvent,
  IconChefHat,
  IconPackage,
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
} from "react-router";
import type { Route } from "./+types/root";

const NAV_ITEMS = [
  { to: "/", label: "Schedule", icon: IconCalendarEvent, end: true },
  { to: "/recipes", label: "Recipes", icon: IconChefHat, end: false },
  { to: "/stock", label: "Stock", icon: IconPackage, end: false },
  { to: "/shopping", label: "Shopping", icon: IconShoppingCart, end: false },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider>
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
            <main style={{ flex: 1, paddingBottom: 70 }}>{children}</main>
            <nav style={{
              position: "fixed", bottom: 0, left: 0, right: 0, height: 64,
              display: "flex", borderTop: "1px solid var(--mantine-color-gray-3)",
              background: "var(--mantine-color-body)", zIndex: 100,
            }}>
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 2,
                  fontSize: 11, textDecoration: "none",
                  color: isActive ? "var(--mantine-color-blue-6)" : "var(--mantine-color-gray-6)",
                })}>
                  <Icon size={24} stroke={1.5} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
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
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
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
