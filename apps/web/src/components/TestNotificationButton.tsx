"use client";

import { useState, useTransition } from "react";
import { sendTestNotification } from "@/app/notification-actions";
import type { FormState } from "@/lib/form";
import { FormMessage } from "./Field";

export function TestNotificationButton() {
  const [result, setResult] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await sendTestNotification()))}
        >
          {pending ? "送っています…" : "テスト通知を送る"}
        </button>
      </div>
      <FormMessage message={result.message} ok={result.ok} />
    </div>
  );
}
