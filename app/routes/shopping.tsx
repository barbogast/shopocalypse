import { Container, Text, Title } from "@mantine/core";

export function meta() {
  return [{ title: "Shopping – Shopocalypse" }];
}

export default function Shopping() {
  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Shopping</Title>
      <Text c="dimmed">Coming soon.</Text>
    </Container>
  );
}
