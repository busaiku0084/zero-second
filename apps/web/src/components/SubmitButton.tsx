"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "default" | "danger";
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "primary"
      ? "button button-primary"
      : variant === "danger"
        ? "button button-danger"
        : "button";
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
