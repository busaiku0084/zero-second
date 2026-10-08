import type { RunWithTimings } from "@zero-second/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { ResultPill } from "@/components/StatusPill";
import { Waterfall } from "@/components/Waterfall";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatElapsed } from "@/lib/format";
import { MODE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "実行結果" };

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  let run: RunWithTimings;
  try {
    run = await api<RunWithTimings>(`/runs/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link
            href={`/reservations/${run.reservationId}`}
            className="muted"
            style={{ fontSize: "0.85rem" }}
          >
            ← 予約に戻る
          </Link>
          <h1>実行結果</h1>
          <div className="button-row">
            <ResultPill result={run.result} />
            <span className="tag">{MODE_LABELS[run.mode]}</span>
          </div>
        </div>
      </div>

      <section className="panel stack" aria-label="概要">
        <dl className="dl">
          <dt>所要時間</dt>
          <dd className="mono">{run.elapsedMs === null ? "—" : formatElapsed(run.elapsedMs)}</dd>
          <dt>開始</dt>
          <dd className="mono">{formatDateTime(run.startedAtMs)}</dd>
          <dt>完了</dt>
          <dd className="mono">
            {run.finishedAtMs === null ? "—" : formatDateTime(run.finishedAtMs)}
          </dd>
          {run.clockOffsetMs !== null ? (
            <>
              <dt>時計のずれ</dt>
              <dd className="mono">{run.clockOffsetMs} ms</dd>
            </>
          ) : null}
          {run.orderId ? (
            <>
              <dt>注文番号</dt>
              <dd className="mono">{run.orderId}</dd>
            </>
          ) : null}
          {run.paymentReference ? (
            <>
              <dt>払込番号</dt>
              <dd className="mono">{run.paymentReference}</dd>
            </>
          ) : null}
          {run.error ? (
            <>
              <dt>エラー</dt>
              <dd>{run.error}</dd>
            </>
          ) : null}
          {run.notes ? (
            <>
              <dt>メモ</dt>
              <dd>{run.notes}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="panel">
        {run.timings.length > 0 ? (
          <Waterfall timings={run.timings} />
        ) : (
          <EmptyState title="リクエストの記録はありません">
            {run.mode === "manual"
              ? "手動で購入した記録には、リクエスト単位の計測はありません。"
              : "このワーカーの実行では計測値が保存されませんでした。"}
          </EmptyState>
        )}
      </section>
    </>
  );
}
