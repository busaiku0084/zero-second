import { findSite, type Reservation } from "@zero-second/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { MODE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "予約" };

export default async function ReservationsPage() {
  const reservations = await api<Reservation[]>("/reservations");
  const now = Date.now();
  const upcoming = reservations
    .filter((r) => r.status === "pending" && r.saleStartsAtMs >= now)
    .sort((a, b) => a.saleStartsAtMs - b.saleStartsAtMs);
  const upcomingIds = new Set(upcoming.map((r) => r.id));
  const past = reservations.filter((r) => !upcomingIds.has(r.id));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>予約</h1>
          <p className="muted">発売を待っている公演と、これまでの結果</p>
        </div>
        <Link href="/reservations/new" className="button button-primary">
          予約を登録
        </Link>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>これからの発売</h2>
          <span className="muted mono">{upcoming.length} 件</span>
        </div>
        {upcoming.length > 0 ? (
          <ReservationTable rows={upcoming} />
        ) : (
          <EmptyState
            title="発売待ちの予約はありません"
            action={
              <Link href="/reservations/new" className="button">
                予約を登録
              </Link>
            }
          >
            公演ページの URL と販売開始時刻を登録しておくと、当日カウントダウンできます。
          </EmptyState>
        )}
      </section>

      {past.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>終わった・取りやめた予約</h2>
            <span className="muted mono">{past.length} 件</span>
          </div>
          <ReservationTable rows={past} />
        </section>
      ) : null}
    </>
  );
}

function ReservationTable({ rows }: { rows: Reservation[] }) {
  return (
    <div className="panel table-wrap" style={{ padding: "16px 8px" }}>
      <table>
        <thead>
          <tr>
            <th>公演</th>
            <th>販売開始</th>
            <th>席種・枚数</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="cell-title">
                  <Link href={`/reservations/${r.id}`}>{r.title}</Link>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {findSite(r.site)?.name ?? r.site} ・ {MODE_LABELS[r.mode]}
                  </span>
                </div>
              </td>
              <td className="mono" style={{ whiteSpace: "nowrap" }}>
                {formatDateTime(r.saleStartsAtMs)}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {r.ticketType} ・ {r.quantity} 枚
              </td>
              <td>
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
