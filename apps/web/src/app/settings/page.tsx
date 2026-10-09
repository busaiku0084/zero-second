import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/auth-actions";
import { PasswordForm } from "@/components/PasswordForm";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>設定</h1>
          <p className="muted">ログイン中のユーザーとパスワード</p>
        </div>
      </div>

      <section className="section">
        <h2>ユーザー</h2>
        <div className="panel">
          <dl className="dl">
            <dt>ログイン ID</dt>
            <dd className="mono">{user.loginId}</dd>
            <dt>権限</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
            <dt>登録日</dt>
            <dd className="mono">{formatDateTime(user.createdAtMs)}</dd>
          </dl>
        </div>
      </section>

      <section className="section">
        <h2>パスワードの変更</h2>
        <div className="panel">
          <PasswordForm />
        </div>
      </section>

      <section className="section">
        <h2>ログアウト</h2>
        <div className="panel stack">
          <p className="muted">
            この端末からログアウトします。予約は消えず、販売時刻になれば実行されます。
          </p>
          <form action={logout}>
            <SubmitButton pendingLabel="ログアウトしています…" variant="default">
              ログアウト
            </SubmitButton>
          </form>
        </div>
      </section>
    </>
  );
}
