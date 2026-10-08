"use client";

import { EmptyState } from "@/components/EmptyState";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const unavailable = error.message.includes("接続できません");
  return (
    <EmptyState
      title={unavailable ? "API に接続できません" : "ページを表示できませんでした"}
      action={
        <button type="button" className="button" onClick={reset}>
          もう一度読み込む
        </button>
      }
    >
      {unavailable
        ? "別のターミナルで make dev-api を実行して API を起動してから、もう一度読み込んでください。"
        : "API が起動しているか（make dev-api）を確認して、もう一度読み込んでください。続く場合は API のログを確認してください。"}
    </EmptyState>
  );
}
