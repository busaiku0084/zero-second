"use client";

import { eventUrlMatchesSite, type Site } from "@zero-second/shared";

/**
 * 予約の登録画面で、公演ページをフォームの右側に表示する（#46）。
 *
 * - 読み込むのは利用者のブラウザだけ。サーバーはサイトにアクセスせず、中身も読まない（ADR 0024）
 * - 埋め込んだページからこのアプリを遷移させない（sandbox に allow-top-navigation を入れない）
 */
export function EventPagePreview({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <aside className="event-preview panel" aria-label="公演ページ">
      <div className="event-preview-head">
        <span className="event-preview-host">{new URL(url).host}</span>
        <div className="event-preview-actions">
          <button
            type="button"
            className="button button-small"
            onClick={() => openEventWindow(url)}
          >
            別ウィンドウで開く
          </button>
          <button type="button" className="button button-small" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
      <iframe
        key={url}
        className="event-preview-frame"
        src={url}
        title="公演ページ"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
      <p className="field-hint">
        何も表示されないときは、サイトが埋め込みを許可していません。「別ウィンドウで開く」で見てください
      </p>
    </aside>
  );
}

/** 表示してよい公演 URL か。選んだサイトのホストの http(s) だけ（javascript: などは表示しない） */
export function previewableUrl(site: Site | undefined, value: string): string | null {
  if (!site) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // このアプリ自身のページは埋め込まない（sandbox を外せてしまうため）
  if (typeof window !== "undefined" && url.origin === window.location.origin) return null;
  return eventUrlMatchesSite(site, url.href) ? url.href : null;
}

/** 公演ページを、画面の右半分に並べた別ウィンドウで開く */
export function openEventWindow(url: string) {
  const width = Math.round(window.screen.availWidth / 2);
  const height = window.screen.availHeight;
  window.open(
    url,
    "zero-second-event",
    `popup,noopener,noreferrer,width=${width},height=${height},left=${width},top=0`,
  );
}
