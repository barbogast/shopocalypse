import { diffLines } from "diff";

export type DiffLine = { kind: "added" | "removed" | "same"; text: string } | { kind: "skipped"; count: number };

// Unchanged lines kept around each change
const CONTEXT = 2;

// The line changes from one recipe version's text to the next, with long unchanged
// stretches cut down to the lines around the changes
export function diffVersions(older: string, newer: string) {
  // Trailing newlines, so a line added at the end doesn't also change the line before it
  const lines = diffLines(`${older}\n`, `${newer}\n`).flatMap((part) => {
    const kind = part.added ? "added" : part.removed ? "removed" : "same";
    return part.value.replace(/\n$/, "").split("\n").map((text) => ({ kind, text }) as const);
  });

  const shown: DiffLine[] = [];
  for (let start = 0; start < lines.length;) {
    if (lines[start].kind !== "same") {
      shown.push(lines[start++]);
      continue;
    }
    let end = start;
    while (end < lines.length && lines[end].kind === "same") end++;
    const keepBefore = start === 0 ? 0 : CONTEXT;
    const keepAfter = end === lines.length ? 0 : CONTEXT;
    // Skipping a single line saves nothing over showing it
    if (end - start > keepBefore + keepAfter + 1) {
      shown.push(...lines.slice(start, start + keepBefore), { kind: "skipped", count: end - start - keepBefore - keepAfter },
        ...lines.slice(end - keepAfter, end));
    } else {
      shown.push(...lines.slice(start, end));
    }
    start = end;
  }

  return {
    lines: shown,
    added: lines.filter((l) => l.kind === "added").length,
    removed: lines.filter((l) => l.kind === "removed").length,
  };
}
