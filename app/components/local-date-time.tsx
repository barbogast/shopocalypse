import { useEffect, useState } from "react";

// Formats a timestamp in the browser's time zone. The server's zone may differ,
// so nothing is rendered until the page has hydrated.
export function LocalDateTime({ iso }: { iso: string }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    setFormatted(new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }));
  }, [iso]);

  return <time dateTime={iso}>{formatted}</time>;
}
