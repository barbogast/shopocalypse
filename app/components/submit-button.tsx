import { Button, type ButtonProps } from "@mantine/core";
import { type ComponentPropsWithoutRef, useEffect, useState } from "react";
import { useNavigation } from "react-router";

// Submit button that spins (and is disabled) from the tap until the page has
// reloaded, so a double tap on a slow connection can't submit twice
export function SubmitButton({ onClick, ...props }: ButtonProps & ComponentPropsWithoutRef<"button">) {
  const navigation = useNavigation();
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (navigation.state === "idle") setClicked(false);
  }, [navigation.state]);

  return (
    <Button
      type="submit"
      loading={clicked && navigation.formData != null}
      onClick={(e) => {
        setClicked(true);
        onClick?.(e);
      }}
      {...props}
    />
  );
}
