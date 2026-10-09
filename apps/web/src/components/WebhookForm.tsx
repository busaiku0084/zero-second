"use client";

import type { WebhookKind } from "@zero-second/shared";
import { useActionState } from "react";
import { removeWebhook, saveWebhook } from "@/app/notification-actions";
import type { FormState } from "@/lib/form";
import { ConfirmButton } from "./ConfirmButton";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

const KIND_LABELS: Record<WebhookKind, string> = { discord: "Discord", slack: "Slack" };

export function WebhookForm({ kind }: { kind: WebhookKind | null }) {
  const [state, action] = useActionState<FormState, FormData>(saveWebhook, {});
  const e = state.fieldErrors ?? {};
  return (
    <div className="stack" style={{ gap: 12 }}>
      {kind ? (
        <div className="button-row">
          <span className="pill tone-good">設定済み</span>
          <span className="muted">{KIND_LABELS[kind]} に送ります（URL は表示しません）</span>
          <ConfirmButton
            label="解除"
            confirmLabel="解除する"
            pendingLabel="解除しています…"
            onConfirm={removeWebhook}
            danger
          />
        </div>
      ) : null}
      <form action={action} className="form" noValidate>
        <FormMessage message={state.message} ok={state.ok} />
        <Field
          id="webhookUrl"
          label={kind ? "Webhook の URL を変える" : "Webhook の URL"}
          hint="Discord（https://discord.com/api/webhooks/…）か Slack（https://hooks.slack.com/services/…）。暗号化して保存します"
          error={e.webhookUrl}
        >
          <div className="input-row">
            <input
              id="webhookUrl"
              name="webhookUrl"
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://discord.com/api/webhooks/…"
              aria-invalid={Boolean(e.webhookUrl)}
            />
            <SubmitButton pendingLabel="保存しています…" variant="default">
              保存
            </SubmitButton>
          </div>
        </Field>
      </form>
    </div>
  );
}
