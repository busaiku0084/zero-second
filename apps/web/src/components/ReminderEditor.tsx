"use client";

import { REMINDER_MINUTE_OPTIONS } from "@zero-second/shared";
import { useActionState } from "react";
import { updateReminders } from "@/app/notification-actions";
import type { FormState } from "@/lib/form";
import { reminderLabel } from "@/lib/labels";
import { FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function ReminderEditor({
  reservationId,
  minutes,
}: {
  reservationId: number;
  minutes: number[];
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateReminders.bind(null, reservationId),
    {},
  );
  return (
    <form action={action} className="stack">
      <FormMessage message={state.message} ok={state.ok} />
      <div className="check-row">
        {REMINDER_MINUTE_OPTIONS.map((m) => (
          <label key={m} className="check">
            <input
              type="checkbox"
              name="reminderMinutes"
              value={m}
              defaultChecked={minutes.includes(m)}
            />
            {reminderLabel(m)}
          </label>
        ))}
      </div>
      <div className="button-row">
        <SubmitButton pendingLabel="保存しています…" variant="default">
          通知を保存
        </SubmitButton>
      </div>
    </form>
  );
}
