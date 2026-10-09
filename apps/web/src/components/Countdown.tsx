"use client";

import { useEffect, useState } from "react";
import { describeOffset } from "@/lib/clock";
import { formatElapsed } from "@/lib/format";
import { useServerClock } from "./useServerClock";

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
 * 販売開始までの残りミリ秒（負なら販売開始からの経過）。
 * サーバーの時計とのずれを測って補正する（ADR 0018）。描画の前は null
 */
export function useRemaining(targetMs: number) {
  const clock = useServerClock();
  const [deviceNow, setDeviceNow] = useState<number | null>(null);

  useEffect(() => {
    setDeviceNow(Date.now());
    const id = window.setInterval(() => setDeviceNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  const remaining = deviceNow === null ? null : targetMs - (deviceNow + (clock?.offsetMs ?? 0));
  return { remaining, clock };
}

export function Countdown({
  targetMs,
  showClock = false,
  large = false,
}: {
  targetMs: number;
  /** 時計のずれの測定結果を下に出す */
  showClock?: boolean;
  large?: boolean;
}) {
  const { remaining, clock } = useRemaining(targetMs);
  const cls = `countdown${large ? " countdown-large" : ""}`;

  let display: React.ReactNode;
  if (remaining === null) {
    display = (
      <p className={cls} aria-hidden="true">
        T−··:··:··.·
      </p>
    );
  } else if (remaining > 0) {
    display = (
      <p className={cls} role="timer" aria-live="off">
        {formatRemaining(remaining)}
      </p>
    );
  } else {
    display = (
      <p className={`${cls} countdown-live`} role="timer" aria-live="off">
        販売中 {formatElapsed(-remaining)}
      </p>
    );
  }

  if (!showClock) return display;
  return (
    <div className="countdown-wrap">
      {display}
      <p className="clock-note">
        {clock ? describeOffset(clock) : "サーバーの時計とのずれを測っています…"}
      </p>
    </div>
  );
}
