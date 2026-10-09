"use client";

import { useActionState } from "react";
import { login } from "@/app/auth-actions";
import type { FormState } from "@/lib/form";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage message={state.message} ok={state.ok} />
      <input type="hidden" name="next" value={next} />
      <Field id="login-loginId" label="ログイン ID" error={e.loginId}>
        <input
          id="login-loginId"
          name="loginId"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={v.loginId}
          aria-invalid={Boolean(e.loginId)}
          required
        />
      </Field>
      <Field id="login-password" label="パスワード" error={e.password}>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(e.password)}
          required
        />
      </Field>
      <SubmitButton pendingLabel="ログインしています…">ログイン</SubmitButton>
    </form>
  );
}
