// zero-second のサービスワーカー。ブラウザ通知（Web Push）を表示し、押したら画面を開く（ADR 0017）
// ページのキャッシュはしない

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "zero-second", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "zero-second", {
      body: data.body || "",
      tag: data.tag,
      data: { url: data.url || "/" },
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 同じサイトの中のパスだけを開く
  const path = String(event.notification.data?.url || "/");
  const url = new URL(
    path.startsWith("/") && !path.startsWith("//") ? path : "/",
    self.location.origin,
  );
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === url.origin && "focus" in w) {
          return w.navigate(url.href).then((c) => (c ?? w).focus());
        }
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
