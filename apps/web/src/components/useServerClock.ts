"use client";

import { useEffect, useState } from "react";
import { type ClockOffset, type ClockSample, estimateOffset } from "@/lib/clock";

const SAMPLES = 6;
/** 測り直す間隔（端末の時計は少しずつずれていく） */
const REFRESH_MS = 10 * 60 * 1000;

let cached: { at: number; promise: Promise<ClockOffset | null> } | undefined;

async function measure(): Promise<ClockOffset | null> {
  const samples: ClockSample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    try {
      const t0 = Date.now();
      const res = await fetch("/api/time", { cache: "no-store" });
      const { now } = (await res.json()) as { now: number };
      const t1 = Date.now();
      // 1 回目は接続を張る時間が入るので使わない
      if (i > 0) samples.push({ t0, t1, server: now });
    } catch {
      // 測れなかった回は飛ばす
    }
  }
  return estimateOffset(samples);
}

/** 画面の中のすべてのカウントダウンで、1 回の測定を共有する */
function sharedOffset(): Promise<ClockOffset | null> {
  if (!cached || Date.now() - cached.at > REFRESH_MS) {
    cached = { at: Date.now(), promise: measure() };
  }
  return cached.promise;
}

/** サーバーの時計とのずれ。測るまでは null（端末の時計のまま表示する） */
export function useServerClock(): ClockOffset | null {
  const [offset, setOffset] = useState<ClockOffset | null>(null);
  useEffect(() => {
    let alive = true;
    const update = () =>
      sharedOffset().then((o) => {
        if (alive) setOffset(o);
      });
    update();
    const id = window.setInterval(update, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return offset;
}
