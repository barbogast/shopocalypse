import { Typography } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

// Renders user-written markdown; single line breaks are kept so plain-text entries read as before
export function Markdown({ children }: { children: string }) {
  return (
    <Typography>
      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{children}</ReactMarkdown>
    </Typography>
  );
}
