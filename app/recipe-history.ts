import { diffLines, diffWords } from "diff";

// Within a changed line, which parts changed: "changed" are removed from the old line or added to the new one
export type WordPart = { changed: boolean; text: string };

export type DiffLine =
  | { kind: "added" | "removed"; text: string; words?: WordPart[] }
  | { kind: "same"; text: string }
  | { kind: "skipped"; count: number };

type ChangedLine = Extract<DiffLine, { kind: "added" | "removed" }>;

// Unchanged lines kept around each change
const CONTEXT = 2;

// Marks the changed words of a removed line and the added line that replaced it. Lines with
// nothing in common keep no words, since marking every word of them says no more than the line does.
function markWords(removed: ChangedLine, added: ChangedLine) {
  const parts = diffWords(removed.text, added.text);
  if (!parts.some((p) => !p.added && !p.removed && p.value.trim())) return;
  removed.words = parts.filter((p) => !p.added).map((p) => ({ changed: !!p.removed, text: p.value }));
  added.words = parts.filter((p) => !p.removed).map((p) => ({ changed: !!p.added, text: p.value }));
}

// The line changes from one recipe version's text to the next, with long unchanged
// stretches cut down to the lines around the changes
export function diffVersions(older: string, newer: string) {
  // Trailing newlines, so a line added at the end doesn't also change the line before it; blank lines at the end don't count
  const lines: DiffLine[] = diffLines(`${older.trimEnd()}\n`, `${newer.trimEnd()}\n`).flatMap((part) => {
    const kind = part.added ? "added" : part.removed ? "removed" : "same";
    return part.value.replace(/\n$/, "").split("\n").map((text) => ({ kind, text }) as DiffLine);
  });

  // Removed lines followed by added ones were most likely edited: pair them up in order
  for (let i = 0; i < lines.length;) {
    let removedEnd = i;
    while (removedEnd < lines.length && lines[removedEnd].kind === "removed") removedEnd++;
    let addedEnd = removedEnd;
    while (addedEnd < lines.length && lines[addedEnd].kind === "added") addedEnd++;
    for (let k = 0; k < Math.min(removedEnd - i, addedEnd - removedEnd); k++) {
      markWords(lines[i + k] as ChangedLine, lines[removedEnd + k] as ChangedLine);
    }
    i = Math.max(addedEnd, i + 1);
  }

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
