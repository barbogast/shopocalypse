import { Container, Text, Title } from "@mantine/core";

export function meta() {
  return [{ title: "Stock – Shopocalypse" }];
}

export default function Stock() {
  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Stock</Title>
      <Text c="dimmed">Coming soon.</Text>
    </Container>
  );
}
