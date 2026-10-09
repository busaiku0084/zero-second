import Link from "next/link";
import { logout } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/session";
import { Nav } from "./Nav";

/** ヘッダーのナビとユーザーのメニュー。ログインしていなければ何も出さない */
export async function SessionNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      <Nav isAdmin={user.role === "admin"} />
      <div className="user-menu">
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
