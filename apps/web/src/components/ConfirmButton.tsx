"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/app/actions";

/** 取り消せない操作は 2 段階で確認する（ブラウザの confirm ダイアログは使わない） */
export function ConfirmButton({
  label,
  confirmLabel,
  pendingLabel,
  onConfirm,
  danger,
}: {
  label: string;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => Promise<FormState>;
  danger?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const cls = danger ? "button button-danger" : "button";

  if (!armed) {
    return (
      <button type="button" className={cls} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="button-row">
      <button
        type="button"
        className={cls}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await onConfirm();
            if (res?.message && !res.ok) setError(res.message);
            setArmed(false);
          })
        }
      >
        {pending ? pendingLabel : confirmLabel}
      </button>
      <button type="button" className="button" onClick={() => setArmed(false)} disabled={pending}>
        やめる
      </button>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
