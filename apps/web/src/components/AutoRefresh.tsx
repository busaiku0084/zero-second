"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 一定間隔でサーバーコンポーネントを読み直す。ワーカーが処理中の予約で、状態と結果を追うために使う。
 * タブが裏にあるあいだは止め、戻ってきたら読み直す。
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(refreshIfVisible, intervalMs);
    // 裏にあったあいだの変化は、戻ってきたときにすぐ反映する
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router, intervalMs]);

  return null;
}
