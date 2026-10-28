// Shared by the textarea and its gutter so wrapped lines line up; the left
// padding leaves room for three-digit line numbers
export const TEXT_METRICS = {
  fontFamily: "var(--mantine-font-family-monospace)",
  fontSize: "var(--mantine-font-size-sm)",
  lineHeight: "var(--mantine-line-height)",
  padding: "8px 12px 8px calc(3ch + 20px)",
} as const;

// Line numbers drawn over the textarea. Each line is repeated here in
// transparent text so it wraps exactly like the textarea and its number sits on
// its first row; the textarea autosizes, so there's no scrolling to keep in sync.
export function LineGutter({ text, errorLines }: { text: string; errorLines: Set<number> }) {
  return (
    <div
      aria-hidden
      style={{
        ...TEXT_METRICS,
        position: "absolute",
        inset: 0,
        border: "1px solid transparent",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        color: "transparent",
      }}
    >
      {text.split(/\r?\n/).map((line, i) => (
        <div key={i} style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              right: "calc(100% + 10px)",
              color: errorLines.has(i + 1) ? "var(--mantine-color-red-6)" : "var(--mantine-color-dimmed)",
              fontWeight: errorLines.has(i + 1) ? 700 : undefined,
            }}
          >
            {i + 1}
          </span>
          {line || " "}
        </div>
      ))}
    </div>
  );
}
