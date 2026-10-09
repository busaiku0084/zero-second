"use client";

import type { Site } from "@zero-second/shared";
import { useActionState } from "react";
import { createAccount } from "@/app/actions";
import type { FormState } from "@/lib/form";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function AccountForm({ sites }: { sites: Site[] }) {
  const [state, action] = useActionState<FormState, FormData>(createAccount, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage message={state.message} ok={state.ok} />
      <div className="form-grid">
        <Field id="account-site" label="サイト" error={e.site}>
          <select id="account-site" name="site" defaultValue={v.site ?? sites[0]?.id}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="account-loginId" label="ログイン ID（メールアドレスなど）" error={e.loginId}>
          <input
            id="account-loginId"
            name="loginId"
            autoComplete="off"
            defaultValue={v.loginId}
            aria-invalid={Boolean(e.loginId)}
          />
        </Field>
        <Field
          id="account-password"
          label="パスワード"
          error={e.password}
          hint="暗号化して保存し、画面には二度と表示しません"
          wide
        >
          <input
            id="account-password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(e.password)}
          />
        </Field>
      </div>
      <div className="button-row">
        <SubmitButton pendingLabel="登録しています…">アカウントを登録</SubmitButton>
      </div>
    </form>
  );
}
