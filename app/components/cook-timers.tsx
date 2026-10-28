import { ActionIcon, Affix, Badge, Button, Group, Modal, NumberInput, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconAlarm, IconClock, IconPlayerPause, IconPlayerPlay, IconX } from "@tabler/icons-react";
import type { Parent, PhrasingContent, Root, RootContent, Text as TextNode } from "mdast";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { Components } from "react-markdown";
import { findDurations, formatClock } from "~/cook-timers";

type Timer = {
  id: string;
  key: string | null; // the time in the instructions it was started from; null for a free timer
  label: string;
  endsAt: number | null; // set while running
  remainingMs: number; // used while paused
};

// What the dialog edits: a new timer, or a change to the one with timerId
type Draft = { timerId?: string; key: string | null; label: string; minutes: number; seconds: number };

const remaining = (t: Timer, now: number) => (t.endsAt != null ? t.endsAt - now : t.remainingMs);
const isDone = (t: Timer, now: number) => t.endsAt != null && t.endsAt <= now;
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function draftFor(key: string | null, label: string, ms: number, timerId?: string): Draft {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { timerId, key, label, minutes: Math.floor(total / 60), seconds: total % 60 };
}

// Browsers only play sound once the page has had a tap, so the context is
// created (or resumed) from one
let audio: AudioContext | null = null;
function unlockAudio() {
  audio ??= new AudioContext();
  audio.resume().catch(() => {});
}

function beep() {
  if (!audio) return;
  audio.resume().catch(() => {});
  const start = audio.currentTime;
  for (const offset of [0, 0.25, 0.5]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.2);
  }
}

type TimersContext = { timers: Timer[]; now: number; edit: (draft: Draft) => void; remove: (id: string) => void };
const Context = createContext<TimersContext | null>(null);

// Turns each cooking time in the instructions into a timer-chip element, keyed
// by its position so a running timer can be shown on the time it came from
export function remarkTimers() {
  return (tree: Root) => splitTexts(tree);
}

function splitTexts(node: Parent) {
  node.children = node.children.flatMap((child): RootContent[] => {
    if (child.type === "text") return splitText(child);
    if ("children" in child) splitTexts(child);
    return [child];
  });
}

function splitText(node: TextNode): PhrasingContent[] {
  const durations = findDurations(node.value);
  if (durations.length === 0) return [node];
  const at = node.position?.start;
  const label = node.value.trim();
  const parts: PhrasingContent[] = [];
  let pos = 0;
  for (const d of durations) {
    if (d.index > pos) parts.push({ type: "text", value: node.value.slice(pos, d.index) });
    // mdast-util-to-hast renders unknown nodes as the element named in data.hName
    parts.push({
      type: "timerChip",
      children: [{ type: "text", value: d.text }],
      data: {
        hName: "timer-chip",
        hProperties: { dataSeconds: d.seconds, dataKey: `${at?.line}:${at?.column}:${d.index}`, dataLabel: label },
      },
    } as unknown as PhrasingContent);
    pos = d.index + d.text.length;
  }
  if (pos < node.value.length) parts.push({ type: "text", value: node.value.slice(pos) });
  return parts;
}

function TimerChip(props: { "data-seconds"?: string; "data-key"?: string; "data-label"?: string; children?: ReactNode }) {
  const ctx = useContext(Context);
  if (!ctx) return <>{props.children}</>;
  const key = props["data-key"] ?? null;
  const label = props["data-label"] ?? "";
  const timer = ctx.timers.find((t) => t.key === key);
  const done = timer != null && isDone(timer, ctx.now);
  const onClick = () => {
    if (!timer) ctx.edit(draftFor(key, label, Number(props["data-seconds"]) * 1000));
    else if (done) ctx.remove(timer.id);
    else ctx.edit(draftFor(key, label, remaining(timer, ctx.now), timer.id));
  };
  return (
    <Badge component="button" type="button" onClick={onClick} size="lg" tt="none" fw={600}
      variant={timer ? "filled" : "light"} color={done ? "red" : "blue"}
      leftSection={<IconClock size={14} />} style={{ cursor: "pointer", verticalAlign: "baseline" }}>
      {timer ? (done ? "Fertig!" : formatClock(remaining(timer, ctx.now))) : props.children}
    </Badge>
  );
}

export const timerComponents = { "timer-chip": TimerChip } as Components;

// Timers for the cook page: times in the instructions start one when tapped
// (render them with remarkTimers and timerComponents), and a button starts a
// free one. They're kept in the browser per recipe, so they survive a reload.
// They only ring while the page is open; the cook page keeps the screen on.
export function CookTimers({ recipeId, children }: { recipeId: number; children: ReactNode }) {
  const storageKey = `cook-timers:${recipeId}`;
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    try {
      setTimers(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Timer[]);
    } catch {
      // Without storage, timers last until the page is left
    }
  }, [storageKey]);

  // Saved here rather than in an effect, so an effect can't overwrite the stored timers before they're loaded
  const save = (next: Timer[]) => {
    setTimers(next);
    try {
      if (next.length > 0) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    } catch {
      // As above
    }
  };

  // Timers restored after a reload can only ring once the page has been tapped
  useEffect(() => {
    document.addEventListener("pointerdown", unlockAudio);
    return () => document.removeEventListener("pointerdown", unlockAudio);
  }, []);

  const running = timers.some((t) => t.endsAt != null);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const ringing = timers.some((t) => isDone(t, now));
  useEffect(() => {
    if (!ringing) return;
    const ring = () => {
      beep();
      navigator.vibrate?.([200, 100, 200]);
    };
    ring();
    const id = setInterval(ring, 1500);
    return () => clearInterval(id);
  }, [ringing]);

  const remove = (id: string) => save(timers.filter((t) => t.id !== id));
  const togglePause = (id: string) => {
    const at = Date.now();
    save(timers.map((t) => t.id !== id ? t
      : t.endsAt != null ? { ...t, endsAt: null, remainingMs: t.endsAt - at }
      : { ...t, endsAt: at + t.remainingMs }));
  };

  const start = () => {
    if (!draft) return;
    unlockAudio();
    const ms = (draft.minutes * 60 + draft.seconds) * 1000;
    const endsAt = Date.now() + ms;
    setNow(Date.now());
    save(draft.timerId
      ? timers.map((t) => (t.id === draft.timerId ? { ...t, endsAt, remainingMs: ms } : t))
      : [...timers, { id: newId(), key: draft.key, label: draft.label, endsAt, remainingMs: ms }]);
    setDraft(null);
  };

  const total = draft ? draft.minutes * 60 + draft.seconds : 0;

  return (
    <Context.Provider value={{ timers, now, edit: setDraft, remove }}>
      {children}

      <Modal opened={draft != null} onClose={() => setDraft(null)} centered
        title={draft?.timerId ? "Timer ändern" : "Timer stellen"}>
        {draft && (
          <Stack>
            {draft.key != null && <Text size="sm" c="dimmed" lineClamp={2}>{draft.label}</Text>}
            <Group grow>
              <NumberInput label="Minuten" size="lg" min={0} max={999} allowDecimal={false} allowNegative={false}
                value={draft.minutes} onChange={(v) => setDraft({ ...draft, minutes: Number(v) || 0 })} />
              <NumberInput label="Sekunden" size="lg" min={0} max={59} allowDecimal={false} allowNegative={false}
                clampBehavior="strict" value={draft.seconds}
                onChange={(v) => setDraft({ ...draft, seconds: Number(v) || 0 })} />
            </Group>
            <Group>
              {/* Focused instead of the inputs, so the keyboard only opens when the time is changed */}
              <Button data-autofocus onClick={start} disabled={total <= 0} leftSection={<IconPlayerPlay size={16} />}>
                Starten
              </Button>
              {draft.timerId && (
                <Button variant="subtle" color="red" onClick={() => { remove(draft.timerId!); setDraft(null); }}>
                  Löschen
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Above the bottom nav. Running timers fill a bar that scrolls sideways; the
          page leaves room at its end so the bar never hides anything for good. */}
      <Affix position={{ bottom: "calc(70px + env(safe-area-inset-bottom))", left: 0, right: 0 }}
        style={{ pointerEvents: "none" }}>
        <Group gap="xs" wrap="nowrap" p="xs" style={{
          pointerEvents: "auto",
          ...(timers.length > 0 && {
            background: "var(--mantine-color-body)",
            borderTop: "1px solid var(--mantine-color-default-border)",
          }),
        }}>
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
            {timers.map((t) => {
              const done = isDone(t, now);
              return (
                <Paper key={t.id} withBorder radius="md" py={4} px="xs" w={190} style={{ flexShrink: 0 }}
                  bg={done ? "var(--mantine-color-red-light)" : undefined}>
                  <Group gap={2} wrap="nowrap">
                    <UnstyledButton style={{ flex: 1, minWidth: 0 }}
                      onClick={() => done ? remove(t.id) : setDraft(draftFor(t.key, t.label, remaining(t, now), t.id))}>
                      <Text fz="lg" fw={700} ff="monospace" lh={1.2} c={done ? "red" : t.endsAt == null ? "dimmed" : undefined}>
                        {done ? "Fertig!" : formatClock(remaining(t, now))}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>{t.label}</Text>
                    </UnstyledButton>
                    {!done && (
                      <ActionIcon variant="subtle" onClick={() => togglePause(t.id)}
                        aria-label={t.endsAt != null ? "Anhalten" : "Fortsetzen"}>
                        {t.endsAt != null ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
                      </ActionIcon>
                    )}
                    <ActionIcon variant="subtle" color="gray" onClick={() => remove(t.id)} aria-label="Timer entfernen">
                      <IconX size={18} />
                    </ActionIcon>
                  </Group>
                </Paper>
              );
            })}
          </Group>
          <Button radius="xl" leftSection={<IconAlarm size={18} />} style={{ flexShrink: 0, boxShadow: "var(--mantine-shadow-md)" }}
            onClick={() => setDraft({ key: null, label: "Timer", minutes: 5, seconds: 0 })}>
            Timer
          </Button>
        </Group>
      </Affix>
    </Context.Provider>
  );
}
