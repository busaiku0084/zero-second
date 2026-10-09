// サーバー側（Server Components / Server Actions）からのみ使う

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SESSION_COOKIE } from "./session-cookie";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:47301";

export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
  }
}

export class ApiUnavailableError extends Error {}

export async function api<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    /**
     * 401（未ログイン・セッション切れ）のとき、redirect はログイン画面へ移動し、
     * throw は ApiError を投げる（ログイン画面など、移動するとループするところで使う）
     */
    onUnauthorized?: "redirect" | "throw";
  } = {},
): Promise<T> {
  // 常にリクエスト時に取得する（ビルド時の事前描画で API を呼ばない）
  await connection();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.API_TOKEN) headers.authorization = `Bearer ${process.env.API_TOKEN}`;
  // ブラウザの Cookie のセッションを API に渡す。API が本人のデータだけを返す（ADR 0016）
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (session) headers["x-session-token"] = session;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiUnavailableError(`API（${API_URL}）に接続できません`);
  }

  if (res.status === 401 && (init.onUnauthorized ?? "redirect") === "redirect") {
    redirect("/login");
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    issues?: ApiIssue[];
  };
  if (!res.ok) {
    throw new ApiError(body.error ?? `API エラー（${res.status}）`, res.status, body.issues ?? []);
  }
  return body as T;
}
