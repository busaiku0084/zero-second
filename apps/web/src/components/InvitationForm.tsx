"use client";

import { useActionState } from "react";
import { createInvitation } from "@/app/auth-actions";
import type { FormState } from "@/lib/form";
import { CopyField } from "./CopyField";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function InvitationForm() {
  const [state, action] = useActionState<FormState, FormData>(createInvitation, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage message={state.message} ok={state.ok} />
      {state.link ? (
        <Field
          id="invitation-link"
          label="招待リンク"
          hint="7 日間有効で、1 人だけ登録できます。招待したい人に直接送ってください"
          wide
        >
          <CopyField id="invitation-link" value={state.link} />
        </Field>
      ) : null}
      <Field
        id="invitation-note"
        label="メモ（任意）"
        hint="誰に送ったかの控え。招待された人には見えません"
        error={e.note}
      >
        <input id="invitation-note" name="note" maxLength={100} aria-invalid={Boolean(e.note)} />
      </Field>
      <div className="button-row">
        <SubmitButton pendingLabel="作っています…">招待リンクを作る</SubmitButton>
      </div>
    </form>
  );
}
