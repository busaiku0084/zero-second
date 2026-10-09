import { type Account, type ChecklistItem, findSite, type Reservation } from "@zero-second/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Checklist } from "@/components/Checklist";
import { LaunchPanel } from "@/components/LaunchPanel";
import { StatusPill } from "@/components/StatusPill";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { MODE_LABELS, PAYMENT_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "ランチャー" };

async function load(id: string) {
  try {
    return await api<Reservation & { checklist: ChecklistItem[] }>(
      `/reservations/${encodeURIComponent(id)}`,
    );
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}

export default async function LaunchPage({ params }: PageProps<"/reservations/[id]/launch">) {
  const { id } = await params;
  const [r, accounts] = await Promise.all([load(id), api<Account[]>("/accounts")]);
  const site = findSite(r.site);
  const account = accounts.find((a) => a.id === r.accountId);

  return (
    <>
      <div className="page-header">
        <div>
          <Link href={`/reservations/${r.id}`} className="muted" style={{ fontSize: "0.85rem" }}>
            ← 予約の詳細
          </Link>
          <h1>{r.title}</h1>
          <div className="button-row">
            <StatusPill status={r.status} />
            <span className="tag">{site?.name ?? r.site}</span>
            <span className="tag">{MODE_LABELS[r.mode]}</span>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <LaunchPanel targetMs={r.saleStartsAtMs} eventUrl={r.eventUrl} />
          <section className="panel stack" aria-label="購入前チェックリスト">
            <h3>購入前チェックリスト</h3>
            <Checklist reservationId={r.id} items={r.checklist} editable={false} />
          </section>
        </div>

        <aside className="panel stack" aria-label="購入するもの">
          <h3>購入するもの</h3>
          <dl className="dl dl-large">
            <dt>販売開始</dt>
            <dd className="mono">{formatDateTime(r.saleStartsAtMs)}</dd>
            <dt>席種</dt>
            <dd>{r.ticketType}</dd>
            <dt>枚数</dt>
            <dd>{r.quantity} 枚</dd>
            <dt>支払い</dt>
            <dd>{PAYMENT_LABELS[r.paymentMethod]}</dd>
            <dt>アカウント</dt>
            <dd className="mono">{account?.loginId ?? "指定なし"}</dd>
          </dl>
          {r.notes ? (
            <div className="stack" style={{ gap: 4 }}>
              <h3>メモ</h3>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.notes}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
