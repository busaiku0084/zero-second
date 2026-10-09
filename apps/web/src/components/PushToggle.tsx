"use client";

import { useEffect, useState, useTransition } from "react";
import { deletePushSubscription, savePushSubscription } from "@/app/notification-actions";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

/** VAPID の公開鍵（base64url）を PushManager に渡す形にする */
function toKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** この端末のブラウザ通知のオン・オフ */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    registration()
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setState(s ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  function enable() {
    setError(undefined);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await registration();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKey(publicKey),
        });
        const res = await savePushSubscription(sub.toJSON());
        if (!res.ok) {
          await sub.unsubscribe();
          setError(res.message);
          return;
        }
        setState("on");
      } catch {
        setError("ブラウザ通知を有効にできませんでした");
      }
    });
  }

  function disable() {
    setError(undefined);
    startTransition(async () => {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });
  }

  const description: Record<State, string> = {
    loading: "確認しています…",
    unsupported:
      "このブラウザはプッシュ通知に対応していません（iPhone はホーム画面に追加すると使えます）",
    denied: "ブラウザの設定で通知がブロックされています。サイトの設定から許可してください",
    off: "この端末には届きません",
    on: "この端末に届きます",
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="button-row">
        <span className={state === "on" ? "pill tone-good" : "pill tone-neutral"}>
          {state === "on" ? "オン" : "オフ"}
        </span>
        <span className="muted">{description[state]}</span>
      </div>
      <div className="button-row">
        {state === "off" ? (
          <button
            type="button"
            className="button button-primary"
            onClick={enable}
            disabled={pending}
          >
            {pending ? "設定しています…" : "この端末で受け取る"}
          </button>
        ) : null}
        {state === "on" ? (
          <button type="button" className="button" onClick={disable} disabled={pending}>
            {pending ? "解除しています…" : "この端末では受け取らない"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
