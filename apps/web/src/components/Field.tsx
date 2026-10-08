import type { ReactNode } from "react";

export function Field({
  id,
  label,
  hint,
  error,
  wide,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "field field-wide" : "field"}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({ message, ok }: { message?: string; ok?: boolean }) {
  if (!message) return null;
  return (
    <p className={ok ? "notice" : "notice notice-error"} role={ok ? "status" : "alert"}>
      {message}
    </p>
  );
}
