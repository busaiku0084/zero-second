"use client";

import { PASSWORD_MIN_LENGTH } from "@zero-second/shared";
import { useActionState } from "react";
import { changePassword } from "@/app/auth-actions";
import type { FormState } from "@/lib/form";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePassword, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage message={state.message} ok={state.ok} />
      <div className="form-grid">
        <Field id="password-current" label="現在のパスワード" error={e.currentPassword} wide>
          <input
            id="password-current"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(e.currentPassword)}
          />
        </Field>
        <Field
          id="password-new"
          label="新しいパスワード"
          hint={`${PASSWORD_MIN_LENGTH} 文字以上`}
          error={e.newPassword}
        >
          <input
            id="password-new"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            aria-invalid={Boolean(e.newPassword)}
          />
        </Field>
        <Field id="password-confirm" label="新しいパスワード（確認）" error={e.newPasswordConfirm}>
          <input
            id="password-confirm"
            name="newPasswordConfirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(e.newPasswordConfirm)}
          />
        </Field>
      </div>
      <div className="button-row">
        <SubmitButton pendingLabel="変更しています…">パスワードを変更</SubmitButton>
      </div>
    </form>
  );
}
