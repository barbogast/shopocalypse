// A red bar along the top and a "DEV" tag in the corner, on every page of a dev
// build, so the local app can't be mistaken for production. Clicks pass through.
export function DevMarker() {
  if (!import.meta.env.DEV) return null;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1000 }}>
      <div style={{ height: 4, background: "var(--mantine-color-red-6)" }} />
      <div style={{
        position: "absolute", top: 4, right: 0, padding: "2px 8px",
        background: "var(--mantine-color-red-6)", color: "white",
        fontSize: 11, fontWeight: 700, letterSpacing: 1,
        borderBottomLeftRadius: 4,
      }}>
        DEV
      </div>
    </div>
  );
}
