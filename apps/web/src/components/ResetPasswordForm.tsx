"use client";

import { PASSWORD_MIN_LENGTH } from "@zero-second/shared";
import { useActionState } from "react";
import type { FormState } from "@/lib/form";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function ResetPasswordForm({
  action: submit,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, action] = useActionState<FormState, FormData>(submit, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage message={state.message} ok={state.ok} />
      <Field
        id="reset-password"
        label="新しいパスワード"
        hint={`${PASSWORD_MIN_LENGTH} 文字以上`}
        error={e.password}
      >
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          aria-invalid={Boolean(e.password)}
          required
        />
      </Field>
      <Field id="reset-passwordConfirm" label="新しいパスワード（確認）" error={e.passwordConfirm}>
        <input
          id="reset-passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(e.passwordConfirm)}
          required
        />
      </Field>
      <SubmitButton pendingLabel="変更しています…">パスワードを変更してログイン</SubmitButton>
    </form>
  );
}
