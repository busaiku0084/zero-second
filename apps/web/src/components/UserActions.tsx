"use client";

import type { User } from "@zero-second/shared";
import { useState, useTransition } from "react";
import { createPasswordResetLink, updateUser } from "@/app/auth-actions";
import type { FormState } from "@/lib/form";
import { ConfirmButton } from "./ConfirmButton";
import { CopyField } from "./CopyField";
import { FormMessage } from "./Field";

/** ユーザーごとの操作（管理者。ADR 0020） */
export function UserActions({ user }: { user: User }) {
  const [result, setResult] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const disabled = user.disabledAtMs !== null;

  return (
    <div className="stack" style={{ gap: 8, justifyItems: "end" }}>
      <div className="button-row" style={{ justifyContent: "flex-end" }}>
        {!disabled ? (
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => setResult(await createPasswordResetLink(user.id)))
            }
          >
            再設定リンク
          </button>
        ) : null}
        <ConfirmButton
          label={user.role === "admin" ? "メンバーにする" : "管理者にする"}
          confirmLabel={user.role === "admin" ? "メンバーにする" : "管理者にする"}
          pendingLabel="変更しています…"
          onConfirm={() =>
            updateUser(user.id, { role: user.role === "admin" ? "member" : "admin" })
          }
        />
        <ConfirmButton
          label={disabled ? "再開" : "停止"}
          confirmLabel={disabled ? "再開する" : "停止する"}
          pendingLabel="変更しています…"
          onConfirm={() => updateUser(user.id, { disabled: !disabled })}
          danger={!disabled}
        />
      </div>
      {result.link ? (
        <div className="stack" style={{ gap: 6, width: "min(100%, 520px)" }}>
          <FormMessage message={result.message} ok />
          <CopyField id={`reset-link-${user.id}`} value={result.link} />
        </div>
      ) : (
        <FormMessage message={result.message} ok={result.ok} />
      )}
    </div>
  );
}
