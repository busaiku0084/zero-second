"use client";

import { PASSWORD_MIN_LENGTH } from "@zero-second/shared";
import { useActionState } from "react";
import type { FormState } from "@/lib/form";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

/** 初回セットアップと招待の受け入れで使う、ユーザーの登録フォーム */
export function SignupForm({
  action: submit,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(submit, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage message={state.message} ok={state.ok} />
      <Field
        id="signup-loginId"
        label="ログイン ID"
        hint="半角英数字と _ . - で 3〜32 文字。あとから変えられません"
        error={e.loginId}
      >
        <input
          id="signup-loginId"
          name="loginId"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={v.loginId}
          aria-invalid={Boolean(e.loginId)}
          required
        />
      </Field>
      <Field
        id="signup-password"
        label="パスワード"
        hint={`${PASSWORD_MIN_LENGTH} 文字以上`}
        error={e.password}
      >
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          aria-invalid={Boolean(e.password)}
          required
        />
      </Field>
      <Field id="signup-passwordConfirm" label="パスワード（確認）" error={e.passwordConfirm}>
        <input
          id="signup-passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(e.passwordConfirm)}
          required
        />
      </Field>
      <SubmitButton pendingLabel="登録しています…">{submitLabel}</SubmitButton>
    </form>
  );
}
