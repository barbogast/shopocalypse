import { ActionIcon, Box, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router";
import { addMonths, monthName, monthWeeks } from "~/dates";

export type CookedMeal = { cookedAt: string; recipeId: number; name: string; thumbnailUrl: string | null };

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// A month of cooked meals: a day shows its meal's photo, or the start of its name
// when there's none, so a glance shows what was cooked without hovering
export function CookingCalendar({ meals, today }: { meals: CookedMeal[]; today: string }) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const byDay = new Map<string, CookedMeal[]>();
  for (const meal of meals) byDay.set(meal.cookedAt, [...(byDay.get(meal.cookedAt) ?? []), meal]);
  const firstMonth = meals.reduce((first, m) => (m.cookedAt.slice(0, 7) < first ? m.cookedAt.slice(0, 7) : first), thisMonth);

  return (
    <Box>
      <Group justify="space-between" mb={4}>
        <ActionIcon variant="subtle" color="gray" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= firstMonth} aria-label="Vorheriger Monat">
          <IconChevronLeft size={16} />
        </ActionIcon>
        <Text size="sm" fw={500}>{monthName(month)}</Text>
        <ActionIcon variant="subtle" color="gray" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= thisMonth} aria-label="Nächster Monat">
          <IconChevronRight size={16} />
        </ActionIcon>
      </Group>
      <Box style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} size="xs" c="dimmed" ta="center">{d}</Text>
        ))}
        {monthWeeks(month).flat().map((day, i) =>
          day ? <Day key={day} day={day} meals={byDay.get(day) ?? []} isToday={day === today} /> : <Box key={`pad-${i}`} />,
        )}
      </Box>
    </Box>
  );
}

function Day({ day, meals, isToday }: { day: string; meals: CookedMeal[]; isToday: boolean }) {
  const dayNumber = Number(day.slice(8));
  const meal = meals[0];
  const cell = {
    aspectRatio: "1",
    borderRadius: "var(--mantine-radius-sm)",
    position: "relative" as const,
    overflow: "hidden",
    outline: isToday ? "2px solid var(--mantine-color-green-6)" : undefined,
    outlineOffset: -2,
  };

  if (!meal) {
    return (
      <Box style={cell} p={4}>
        <Text size="xs" c="dimmed" lh={1}>{dayNumber}</Text>
      </Box>
    );
  }

  const names = meals.map((m) => m.name).join(", ");
  return (
    <Tooltip label={names} multiline maw={220}>
      <UnstyledButton
        component={Link}
        to={`/recipes/${meal.recipeId}`}
        aria-label={`${dayNumber}.: ${names}`}
        p={4}
        style={{
          ...cell,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: meal.thumbnailUrl
            ? `center / cover no-repeat url("${meal.thumbnailUrl}")`
            : "var(--mantine-color-green-light)",
        }}
      >
        {meal.thumbnailUrl ? (
          // A dark chip keeps the number readable on any photo
          <Text component="span" size="xs" fw={700} lh={1} c="white"
            style={{ alignSelf: "flex-start", background: "rgba(0, 0, 0, 0.55)", borderRadius: 3, padding: "1px 3px" }}>
            {dayNumber}
          </Text>
        ) : (
          <>
            <Text component="span" size="xs" fw={700} lh={1} c="green">{dayNumber}</Text>
            <Text component="span" fz={9} lh={1.1} lineClamp={2} style={{ hyphens: "auto", overflowWrap: "anywhere" }}>
              {meal.name}
            </Text>
          </>
        )}
        {meals.length > 1 && (
          <Text component="span" fz={9} fw={700} lh={1} c="white"
            style={{ position: "absolute", right: 2, top: 2, background: "var(--mantine-color-green-6)", borderRadius: 3, padding: "1px 3px" }}>
            +{meals.length - 1}
          </Text>
        )}
      </UnstyledButton>
    </Tooltip>
  );
}
