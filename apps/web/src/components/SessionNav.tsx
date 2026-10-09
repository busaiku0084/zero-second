import type { NotificationSummary } from "@zero-second/shared";
import Link from "next/link";
import { logout } from "@/app/auth-actions";
import { api } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Icon } from "./Icon";
import { Nav } from "./Nav";

/** ヘッダーのナビとユーザーのメニュー。ログインしていなければ何も出さない */
export async function SessionNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { unreadCount } = await api<NotificationSummary>("/notifications/summary");
  return (
    <>
      <Nav isAdmin={user.role === "admin"} />
      <div className="user-menu">
        <Link
          href="/notifications"
          className="bell"
          aria-label={unreadCount > 0 ? `通知（未読 ${unreadCount} 件）` : "通知"}
        >
          <Icon name="bell" size={18} />
          {unreadCount > 0 ? (
            <span className="bell-count" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Link>
        <Link href="/settings" className="user-menu-name" title="設定">
          <span className="user-avatar" aria-hidden="true">
            {user.loginId.slice(0, 1).toUpperCase()}
          </span>
          <span className="mono">{user.loginId}</span>
        </Link>
        <form action={logout}>
          <button type="submit" className="link-button">
            ログアウト
          </button>
        </form>
      </div>
    </>
  );
}
