import { Affix, Button, Container, Group, Paper, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VERSION, type Version } from "~/version";

const SLOW_INTERVAL_MS = 3 * 60 * 1000;
const FAST_INTERVAL_MS = 1000;
const WATCH_DURATION_MS = 5 * 60 * 1000;

// Shows which commit is running and offers a reload once a newer one is deployed.
// Checks every few minutes and whenever the tab comes back into view; "Watch for
// deploy" checks every second for five minutes, for right after a push.
export function VersionFooter() {
  const [deployed, setDeployed] = useState<Version | null>(null);
  const [watchUntil, setWatchUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
    <>
      <Container py="md">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="xs" c="dimmed" truncate>
            {VERSION.sha ? `${VERSION.sha.slice(0, 7)} · ${VERSION.message}` : "Development build"}
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
                ? `Watching… ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                : "Watch for deploy"}
            </Button>
          )}
        </Group>
      </Container>

      {deployed && (
        <Affix position={{ bottom: 76, left: 12, right: 12 }}>
          <Paper shadow="md" p="sm" withBorder>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>New version deployed</Text>
                <Text size="xs" c="dimmed" truncate>{deployed.message}</Text>
              </div>
              <Button
                size="xs"
                leftSection={<IconRefresh size={16} />}
                style={{ flexShrink: 0 }}
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            </Group>
          </Paper>
        </Affix>
      )}
    </>
  );
}
