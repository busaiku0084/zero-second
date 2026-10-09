import { findSite, type Reservation, type Run } from "@zero-second/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelReservation, deleteReservation } from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Countdown } from "@/components/Countdown";
import { ManualRunForm } from "@/components/ManualRunForm";
import { ResultPill, StatusPill } from "@/components/StatusPill";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatElapsed } from "@/lib/format";
import { MODE_LABELS, PAYMENT_LABELS } from "@/lib/labels";

type Detail = Reservation & { runs: Run[] };

async function load(id: string): Promise<Detail> {
  if (!/^\d+$/.test(id)) notFound();
  try {
    return await api<Detail>(`/reservations/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/reservations/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await load(id);
  return { title: r.title };
}

export default async function ReservationPage({ params }: PageProps<"/reservations/[id]">) {
  const { id } = await params;
  const r = await load(id);
  const site = findSite(r.site);
  const locked = r.status === "preparing" || r.status === "running";
  // ワーカーが拾ってから結果を書くまでを追えるように、自動購入の待機・処理中は読み直す
  const watching = r.mode === "auto" && (r.status === "pending" || locked);

  return (
    <>
      {watching ? <AutoRefresh intervalMs={locked ? 1_000 : 5_000} /> : null}
      <div className="page-header">
        <div>
          <Link href="/reservations" className="muted" style={{ fontSize: "0.85rem" }}>
            ← 予約一覧
          </Link>
          <h1>{r.title}</h1>
          <div className="button-row">
            <StatusPill status={r.status} />
            <span className="tag">{site?.name ?? r.site}</span>
            <span className="tag">{MODE_LABELS[r.mode]}</span>
          </div>
        </div>
        <a className="button button-primary" href={r.eventUrl} target="_blank" rel="noreferrer">
          公演ページを開く
        </a>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <section className="panel next" aria-label="販売開始">
            <span className="eyebrow">販売開始まで</span>
            <Countdown targetMs={r.saleStartsAtMs} />
            <span className="mono muted">{formatDateTime(r.saleStartsAtMs)}</span>
          </section>

          {r.mode === "manual" && r.status !== "cancelled" ? (
            <section className="panel stack" aria-labelledby="record-heading">
              <div className="stack" style={{ gap: 4 }}>
                <h2 id="record-heading">購入の結果を記録</h2>
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  手で購入したら、結果と完了時刻を残しておくとダッシュボードで振り返れます
                </p>
              </div>
              <ManualRunForm reservationId={r.id} saleStartsAtMs={r.saleStartsAtMs} />
            </section>
          ) : null}

          <section className="section" aria-labelledby="runs-heading">
            <h2 id="runs-heading">これまでの記録</h2>
            {r.runs.length > 0 ? (
              <div className="panel table-wrap" style={{ padding: "16px 8px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>結果</th>
                      <th className="num">所要時間</th>
                      <th>払込番号</th>
                      <th>支払期限</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {r.runs.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <ResultPill result={run.result} />
                        </td>
                        <td className="num">
                          {run.elapsedMs === null ? "—" : formatElapsed(run.elapsedMs)}
                        </td>
                        <td className="mono">{run.paymentReference ?? "—"}</td>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>
                          {run.paymentDueAtMs === null ? "—" : formatDateTime(run.paymentDueAtMs)}
                        </td>
                        <td>
                          <Link href={`/runs/${run.id}`}>詳細</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">まだ記録はありません。</p>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="panel stack" aria-label="予約の内容">
            <h3>予約の内容</h3>
            <dl className="dl">
              <dt>席種</dt>
              <dd>{r.ticketType}</dd>
              <dt>枚数</dt>
              <dd>{r.quantity} 枚</dd>
              <dt>支払い</dt>
              <dd>{PAYMENT_LABELS[r.paymentMethod]}</dd>
              <dt>URL</dt>
              <dd>
                <a href={r.eventUrl} target="_blank" rel="noreferrer">
                  {r.eventUrl}
                </a>
              </dd>
              {r.notes ? (
                <>
                  <dt>メモ</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{r.notes}</dd>
                </>
              ) : null}
            </dl>
          </section>

          {!locked ? (
            <section className="panel stack" aria-label="操作">
              <h3>操作</h3>
              <div className="button-row">
                {r.status === "cancelled" ? (
                  <ConfirmButton
                    label="予約を戻す"
                    confirmLabel="待機中に戻す"
                    pendingLabel="戻しています…"
                    onConfirm={cancelReservation.bind(null, r.id, false)}
                  />
                ) : r.status === "pending" ? (
                  <ConfirmButton
                    label="取りやめる"
                    confirmLabel="取りやめる"
                    pendingLabel="変更しています…"
                    onConfirm={cancelReservation.bind(null, r.id, true)}
                  />
                ) : null}
                <ConfirmButton
                  label="削除"
                  confirmLabel="記録ごと削除する"
                  pendingLabel="削除しています…"
                  onConfirm={deleteReservation.bind(null, r.id)}
                  danger
                />
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
