import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/session-cookie";

/** ログインなしで開ける画面 */
const PUBLIC_PATHS = [/^\/login$/, /^\/setup$/, /^\/invite\/[^/]+$/];

/**
 * Cookie が無ければログイン画面へ移す（楽観的なチェック）。
 * セッションが本当に有効かは API が毎回確かめ、無効なら lib/api.ts がログイン画面へ移す
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => p.test(pathname))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
