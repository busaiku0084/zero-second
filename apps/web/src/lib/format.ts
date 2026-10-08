/** 表示とフォーム入力はすべて日本時間で扱う */
export const TIME_ZONE = "Asia/Tokyo";

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const shortDateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  month: "numeric",
  day: "numeric",
});

/** 2026/10/10(土) 12:00:00 */
export function formatDateTime(ms: number): string {
  const parts = Object.fromEntries(dateTimeFormat.formatToParts(ms).map((p) => [p.type, p.value]));
  return `${parts.year}/${parts.month}/${parts.day}(${parts.weekday}) ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** 10/10 */
export function formatShortDate(ms: number): string {
  return shortDateFormat.format(ms);
}

/**
 * 販売開始からの経過時間をラップタイム風に表す。
 * 42318 → "+00:42.318"、3723004 → "+1:02:03.004"
 */
export function formatElapsed(ms: number): string {
  const sign = ms < 0 ? "−" : "+";
  const abs = Math.abs(Math.round(ms));
  const millis = abs % 1000;
  const totalSeconds = Math.floor(abs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : pad(minutes);
  return `${sign}${head}:${pad(seconds)}.${pad(millis, 3)}`;
}

/** 1 リクエストの所要時間。1 秒未満は ms、それ以上は秒 */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** UNIX ミリ秒 → <input type="datetime-local"> の値（日本時間、秒まで） */
export function toJstInput(ms: number): string {
  const jst = new Date(ms + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 19);
}

/** <input type="datetime-local"> の値（日本時間）→ UNIX ミリ秒。不正なら null */
export function fromJstInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const ms = Date.parse(`${withSeconds}+09:00`);
  return Number.isNaN(ms) ? null : ms;
}
