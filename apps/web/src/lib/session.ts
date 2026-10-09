// ログイン中のユーザーとセッションの Cookie（サーバー側からのみ使う）

import type { User } from "@zero-second/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError, api } from "./api";
import { SESSION_COOKIE } from "./session-cookie";

export async function setSessionCookie(token: string, expiresAtMs: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // https で公開するときは SESSION_COOKIE_SECURE=true にする（http://127.0.0.1 では送られなくなるため既定は false）
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires: new Date(expiresAtMs),
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** ログイン中のユーザー。未ログイン・セッション切れなら null（1 リクエストにつき 1 回だけ API を呼ぶ） */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!(await cookies()).has(SESSION_COOKIE)) return null;
  try {
    return await api<User>("/auth/me", { onUnauthorized: "throw" });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return user;
}
