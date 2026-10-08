// サーバー側（Server Components / Server Actions）からのみ使う

import { connection } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";

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
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  // 常にリクエスト時に取得する（ビルド時の事前描画で API を呼ばない）
  await connection();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.API_TOKEN) headers.authorization = `Bearer ${process.env.API_TOKEN}`;

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
