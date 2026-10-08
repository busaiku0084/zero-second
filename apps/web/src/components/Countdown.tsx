"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";

/** 残り時間を「T−2日 03:12:45.6」の形にする */
function formatRemaining(ms: number): string {
  const tenths = Math.floor(ms / 100) % 10;
  const totalSeconds = Math.floor(ms / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600) % 24;
  const d = Math.floor(totalSeconds / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `T−${d > 0 ? `${d}日 ` : ""}${pad(h)}:${pad(m)}:${pad(s)}.${tenths}`;
}

/**
 * 販売開始までのカウントダウン。端末の時計を使う。
 * TODO(#12): 時刻サーバーで端末の時計のずれを測って補正する
 */
export function Countdown({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  if (now === null) {
    return (
      <p className="countdown" aria-hidden="true">
        T−··:··:··.·
      </p>
    );
  }
  const remaining = targetMs - now;
  if (remaining > 0) {
    return (
      <p className="countdown" role="timer" aria-live="off">
        {formatRemaining(remaining)}
      </p>
    );
  }
  return (
    <p className="countdown countdown-live" role="timer" aria-live="off">
      販売中 {formatElapsed(-remaining)}
    </p>
  );
}
