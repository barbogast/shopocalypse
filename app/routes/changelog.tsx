import { Container, Title } from "@mantine/core";
import { Markdown } from "~/components/markdown";
import { pageTitle } from "~/page-title";
import changelogSource from "../../CHANGELOG.md?raw";

// The file's leading note is for whoever writes entries; markdown would show it as text
const changelog = changelogSource.replace(/<!--[\s\S]*?-->/g, "");

export function meta() {
  return [{ title: pageTitle("Neuigkeiten") }];
}

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

// The file's "## 2026-11-02" headings, shown as "2. November 2026"
function DateHeading({ children }: { children?: React.ReactNode }) {
  const text = String(children);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : null;
  return <h2>{date ? dateFormat.format(date) : children}</h2>;
}

export default function Changelog() {
  return (
    <Container size="sm" py="xl">
      <Title mb="md">Neuigkeiten</Title>
      <Markdown components={{ h2: DateHeading }}>{changelog}</Markdown>
    </Container>
  );
}
