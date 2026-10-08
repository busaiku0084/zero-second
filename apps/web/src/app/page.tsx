import {
  DASHBOARD_RANGES,
  type DashboardRange,
  type DashboardSummary,
  RUN_RESULTS,
} from "@zero-second/shared";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { ElapsedChart } from "@/components/ElapsedChart";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { formatDateTime, formatElapsed } from "@/lib/format";
import { MODE_LABELS, RESULT_LABELS } from "@/lib/labels";

const RANGE_LABELS: Record<DashboardRange, string> = {
  "7d": "7 日",
  "30d": "30 日",
  "90d": "90 日",
  all: "すべて",
};

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const { range: rawRange } = await searchParams;
  const range = DASHBOARD_RANGES.find((r) => r === rawRange) ?? "30d";
  const summary = await api<DashboardSummary>(`/dashboard?range=${range}`);
  const succeeded = summary.series.filter((s) => s.result === "succeeded");
  const successRate = summary.runCount > 0 ? summary.succeededCount / summary.runCount : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>ダッシュボード</h1>
          <p className="muted">販売開始から購入完了までの時間を振り返ります</p>
        </div>
        <nav className="segmented" aria-label="集計期間">
          {DASHBOARD_RANGES.map((r) => (
            <Link
              key={r}
              href={r === "30d" ? "/" : `/?range=${r}`}
              aria-current={r === range ? "true" : undefined}
            >
              {RANGE_LABELS[r]}
            </Link>
          ))}
        </nav>
      </div>

      <section className="hero" aria-label="概要">
        <div className="panel stack">
          <div className="hero-figure">
            <span className="eyebrow">成功までの所要時間（中央値）</span>
            <span className="hero-value">
              {summary.medianElapsedMs === null ? "—" : formatElapsed(summary.medianElapsedMs)}
            </span>
            <span className="hero-caption">
              {summary.medianElapsedMs === null
                ? "購入の記録がまだありません"
                : `直近${RANGE_LABELS[range]}・成功 ${summary.succeededCount} 件の中央値`}
            </span>
          </div>
          <div className="tiles">
            <div className="tile">
              <span className="tile-label">最速</span>
              <span className="tile-value">
                {summary.fastestElapsedMs === null ? "—" : formatElapsed(summary.fastestElapsedMs)}
              </span>
            </div>
            <div className="tile">
              <span className="tile-label">成功率</span>
              <span className="tile-value">
                {successRate === null ? "—" : `${Math.round(successRate * 100)}%`}
              </span>
              <span className="tile-sub">
                {summary.succeededCount} / {summary.runCount} 回
              </span>
            </div>
            <div className="tile">
              <span className="tile-label">挑戦した回数</span>
              <span className="tile-value">{summary.runCount}</span>
            </div>
          </div>
        </div>

        <NextRelease summary={summary} />
      </section>

      <section className="section">
        <div className="panel">
          {succeeded.length > 0 ? (
            <ElapsedChart points={succeeded} />
          ) : (
            <EmptyState title="所要時間の推移はまだありません">
              予約の詳細画面で「今を購入完了として記録」を押すと、ここに推移が表示されます。
            </EmptyState>
          )}
        </div>
      </section>

      {summary.runCount > 0 ? (
        <section className="section">
          <div className="panel stack">
            <h3>結果の内訳</h3>
            <div
              className="stackbar"
              role="img"
              aria-label={RUN_RESULTS.map(
                (r) => `${RESULT_LABELS[r].label} ${summary.resultCounts[r]} 件`,
              ).join("、")}
            >
              {RUN_RESULTS.filter((r) => summary.resultCounts[r] > 0).map((r) => (
                <span
                  key={r}
                  className={`tone-${RESULT_LABELS[r].tone}`}
                  style={{ flexGrow: summary.resultCounts[r] }}
                  title={`${RESULT_LABELS[r].label} ${summary.resultCounts[r]} 件`}
                />
              ))}
            </div>
            <div className="legend">
              {RUN_RESULTS.map((r) => (
                <span key={r} className={`legend-item pill tone-${RESULT_LABELS[r].tone}`}>
                  <Icon name={RESULT_LABELS[r].icon} />
                  {RESULT_LABELS[r].label}
                  <span className="mono">{summary.resultCounts[r]}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function NextRelease({ summary }: { summary: DashboardSummary }) {
  const next = summary.nextReservation;
  if (!next) {
    return (
      <div className="panel next">
        <span className="eyebrow">次の発売</span>
        <EmptyState
          title="待機中の予約はありません"
          action={
            <Link href="/reservations/new" className="button button-primary">
              予約を登録
            </Link>
          }
        >
          公演と販売開始時刻を登録すると、ここでカウントダウンします。
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="panel next">
      <span className="eyebrow">次の発売</span>
      <Countdown targetMs={next.saleStartsAtMs} />
      <div className="next-meta">
        <Link href={`/reservations/${next.id}`} className="next-title">
          {next.title}
        </Link>
        <span className="mono">{formatDateTime(next.saleStartsAtMs)}</span>
        <span>
          {next.ticketType} ・ {next.quantity} 枚 ・ {MODE_LABELS[next.mode]}
        </span>
      </div>
      <div className="button-row">
        <a className="button button-primary" href={next.eventUrl} target="_blank" rel="noreferrer">
          公演ページを開く
        </a>
        <Link className="button" href={`/reservations/${next.id}`}>
          詳細
        </Link>
      </div>
    </div>
  );
}
