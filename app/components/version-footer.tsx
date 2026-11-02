import { Button, Container, Group, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { VERSION, type Version } from "~/version";

const SLOW_INTERVAL_MS = 3 * 60 * 1000;
const FAST_INTERVAL_MS = 1000;
const WATCH_DURATION_MS = 5 * 60 * 1000;

type VersionCheck = {
  deployed: Version | null;
  enabled: boolean;
  check: () => Promise<void>;
};

const VersionCheckContext = createContext<VersionCheck | null>(null);

function useVersionCheck() {
  const value = useContext(VersionCheckContext);
  if (!value) throw new Error("useVersionCheck needs a VersionCheckProvider");
  return value;
}

// Watches for a newer deploy than the one this page was built from. Checks every
// few minutes and whenever the tab comes back into view; shared so the bar at the
// top and the footer at the bottom see the same result.
export function VersionCheckProvider({ children }: { children: React.ReactNode }) {
  const [deployed, setDeployed] = useState<Version | null>(null);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const response = await fetch("/version", { cache: "no-store" });
      if (!response.ok) return;
      const version: Version = await response.json();
      if (version.sha && version.sha !== VERSION.sha) setDeployed(version);
    } catch {
      // Offline or mid-deploy; the next check will try again
    } finally {
      checking.current = false;
    }
  }, []);

  const enabled = Boolean(VERSION.sha) && !deployed;

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const interval = setInterval(check, SLOW_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, check]);

  return (
    <VersionCheckContext.Provider value={{ deployed, enabled, check }}>
      {children}
    </VersionCheckContext.Provider>
  );
}

// A bar across the top of every page once a newer version is deployed. It stays
// in view while scrolling, and its button reloads the page into the new version.
export function NewVersionBar() {
  const { deployed } = useVersionCheck();
  if (!deployed) return null;

  return (
    <div
      role="status"
      style={{
        position: "sticky", top: 0, zIndex: 200,
        paddingTop: "env(safe-area-inset-top)",
        background: "var(--mantine-color-blue-6)", color: "white",
        boxShadow: "var(--mantine-shadow-md)",
      }}
    >
      <Container py="sm">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <div style={{ minWidth: 0 }}>
            <Text fw={700}>Neue Version verfügbar</Text>
            {deployed.message && (
              <Text size="sm" truncate style={{ opacity: 0.85 }}>{deployed.message}</Text>
            )}
          </div>
          <Button
            variant="white"
            leftSection={<IconRefresh size={18} />}
            style={{ flexShrink: 0 }}
            onClick={() => window.location.reload()}
          >
            Neu laden
          </Button>
        </Group>
      </Container>
    </div>
  );
}

// Shows which commit is running. "Auf neue Version warten" checks every second for
// five minutes, for right after a push.
export function VersionFooter() {
  const { enabled, check } = useVersionCheck();
  const [watchUntil, setWatchUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || watchUntil === null) return;
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= watchUntil) setWatchUntil(null);
      else check();
    }, FAST_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, watchUntil, check]);

  const watching = enabled && watchUntil !== null;
  const remaining = watching ? Math.max(0, Math.ceil((watchUntil - now) / 1000)) : 0;

  return (
    <Container py="md">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="xs" c="dimmed" truncate>
          {VERSION.sha ? `${VERSION.sha.slice(0, 7)} · ${VERSION.message}` : "Entwicklungsversion"}
        </Text>
        {enabled && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            style={{ flexShrink: 0 }}
            onClick={() => {
              if (watching) return setWatchUntil(null);
              setNow(Date.now());
              setWatchUntil(Date.now() + WATCH_DURATION_MS);
              check();
            }}
          >
            {watching
              ? `Warte… ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
              : "Auf neue Version warten"}
          </Button>
        )}
      </Group>
    </Container>
  );
}
