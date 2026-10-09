import type { NotificationSettings } from "@zero-second/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/auth-actions";
import { PasswordForm } from "@/components/PasswordForm";
import { PushToggle } from "@/components/PushToggle";
import { SubmitButton } from "@/components/SubmitButton";
import { TestNotificationButton } from "@/components/TestNotificationButton";
import { WebhookForm } from "@/components/WebhookForm";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const notifications = await api<NotificationSettings>("/notifications/settings");

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

      <section className="section" id="notifications">
        <h2>通知の届け先</h2>
        <p className="muted">
          販売開始のリマインドと自動購入の結果を、アプリ内の通知に加えてここで設定した先にも送ります。タイミングは予約ごとに決められます
        </p>
        <div className="panel stack">
          <h3>ブラウザ通知</h3>
          {notifications.pushPublicKey ? (
            <PushToggle publicKey={notifications.pushPublicKey} />
          ) : (
            <p className="muted">
              サーバーにブラウザ通知の鍵（WEB_PUSH_PUBLIC_KEY /
              WEB_PUSH_PRIVATE_KEY）が設定されていないため使えません。docs/operations.md
              の手順で設定してください
            </p>
          )}
          {notifications.pushSubscriptionCount > 0 ? (
            <p className="field-hint">登録済みの端末: {notifications.pushSubscriptionCount} 台</p>
          ) : null}
        </div>
        <div className="panel stack">
          <h3>Discord / Slack</h3>
          <WebhookForm kind={notifications.webhookKind} />
        </div>
        <div className="panel stack">
          <h3>確かめる</h3>
          <TestNotificationButton />
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
