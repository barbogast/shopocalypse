import { Typography } from "@mantine/core";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { PluggableList } from "unified";

// Renders user-written markdown; single line breaks are kept so plain-text entries read as before
export function Markdown({ children, remarkPlugins = [], components }: {
  children: string;
  remarkPlugins?: PluggableList;
  components?: Components;
}) {
  return (
    <Typography>
      <ReactMarkdown remarkPlugins={[remarkBreaks, ...remarkPlugins]} components={components}>{children}</ReactMarkdown>
    </Typography>
  );
}
