// 通知の文面（日本時間で表示する。ADR 0007）

const JST = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatJst(ms: number): string {
  return JST.format(new Date(ms));
}

/** 残り時間をざっくり（「あと 5 分」など） */
export function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "まもなく";
  if (minutes < 60) return `あと ${minutes} 分`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `あと約 ${hours} 時間`;
  return `あと約 ${Math.round(hours / 24)} 日`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(3)} 秒`;
}
