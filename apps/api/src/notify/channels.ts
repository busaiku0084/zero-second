// 通知を外へ送る経路（Web Push・Webhook）。送り先は決まったサービスだけに限る（ADR 0017）

import type { WebhookKind } from "@zero-second/shared";
import webpush from "web-push";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
/** ok: 届いた / gone: 購読が無効（消してよい） / error: それ以外の失敗 */
export type PushResult = "ok" | "gone" | "error";

export type Senders = {
  /** Web Push。VAPID の鍵がなければ null（ブラウザ通知は使わない） */
  push: ((target: PushTarget, payload: string) => Promise<PushResult>) | null;
  webhook: (url: string, kind: WebhookKind, text: string) => Promise<boolean>;
};

/**
 * ブラウザが返す購読の送り先として受け付けるホスト（主なブラウザのプッシュサービス）。
 * 任意の URL に API から POST させない（社内のサービスなどへのリクエストを防ぐ）
 */
const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "") return false;
  return PUSH_HOST_SUFFIXES.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** 環境変数の VAPID の鍵。どちらかが無ければ null */
export function vapidFromEnv(env: NodeJS.ProcessEnv): VapidConfig | null {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env.WEB_PUSH_SUBJECT?.trim() || "mailto:zero-second@example.invalid",
  };
}

const TIMEOUT_MS = 5_000;

export function realSenders(vapid: VapidConfig | null): Senders {
  return {
    push: vapid
      ? async (target, payload) => {
          if (!isAllowedPushEndpoint(target.endpoint)) return "gone";
          try {
            await webpush.sendNotification(
              { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
              payload,
              {
                vapidDetails: vapid,
                TTL: 60 * 60,
                urgency: "high",
                timeout: TIMEOUT_MS,
              },
            );
            return "ok";
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            return status === 404 || status === 410 ? "gone" : "error";
          }
        }
      : null,
    webhook: async (url, kind, text) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(kind === "discord" ? { content: text } : { text }),
          // リダイレクトで別の送り先へ飛ばされないようにする
          redirect: "error",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
