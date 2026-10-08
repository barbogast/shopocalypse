import { Anchor, type AnchorProps } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";

// A recipe's weblink, shown by its site's name and opened in a new tab
export function Weblink({ href, ...props }: { href: string } & AnchorProps) {
  return (
    <Anchor href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {new URL(href).hostname.replace(/^www\./, "")}
      <IconExternalLink size={14} style={{ marginLeft: 4, verticalAlign: "-2px" }} />
    </Anchor>
  );
}
