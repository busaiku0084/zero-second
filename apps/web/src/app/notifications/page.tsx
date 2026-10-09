import type { Notification } from "@zero-second/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { markAllNotificationsRead } from "@/app/notification-actions";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "通知" };

const DELIVERY_TEXT = { sent: "送信済み", failed: "失敗", skipped: null } as const;

function deliveryText(n: Notification): string | null {
  const parts = [
    n.pushStatus && DELIVERY_TEXT[n.pushStatus] ? `ブラウザ ${DELIVERY_TEXT[n.pushStatus]}` : null,
    n.webhookStatus && DELIVERY_TEXT[n.webhookStatus]
      ? `Webhook ${DELIVERY_TEXT[n.webhookStatus]}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function NotificationsPage() {
  const notifications = await api<Notification[]>("/notifications");
  const unread = notifications.filter((n) => n.readAtMs === null).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>通知</h1>
          <p className="muted">販売開始のリマインドと、自動購入の結果（最新 50 件）</p>
        </div>
        {unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <SubmitButton pendingLabel="更新しています…" variant="default">
              すべて既読にする
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {notifications.length > 0 ? (
        <ol className="notice-list panel">
          {notifications.map((n) => {
            const label = NOTIFICATION_LABELS[n.kind];
            const delivery = deliveryText(n);
            return (
              <li key={n.id} className={n.readAtMs === null ? "notice-item unread" : "notice-item"}>
                <span className={`pill tone-${label.tone}`}>
                  <Icon name={label.icon} />
                  {label.label}
                </span>
                <div className="notice-body">
                  <Link href={n.url} className="notice-title">
                    {n.title}
                  </Link>
                  {n.body ? <p>{n.body}</p> : null}
                  <p className="notice-meta mono">
                    {formatDateTime(n.createdAtMs)}
                    {delivery ? ` · ${delivery}` : ""}
                    {n.readAtMs === null ? <span className="sr-only">（未読）</span> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState title="通知はまだありません">
          予約の販売開始が近づくと、ここと設定した届け先（ブラウザ・Discord・Slack）にお知らせします。届け先は
          <Link href="/settings">設定</Link>で決められます。
        </EmptyState>
      )}
    </>
  );
}
