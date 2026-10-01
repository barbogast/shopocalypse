import { Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

// A form's validation error from its action, if any
export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py="xs">
      {error}
    </Alert>
  );
}
