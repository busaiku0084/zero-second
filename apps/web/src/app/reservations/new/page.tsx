import type { Account, Site } from "@zero-second/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ReservationForm } from "@/components/ReservationForm";
import { api } from "@/lib/api";
import { toJstInput } from "@/lib/format";

export const metadata: Metadata = { title: "予約を登録" };

/** 既定の販売開始: 明日の 12:00（日本時間）。発売は正時が多いため */
function tomorrowNoonJst(): string {
  const tomorrow = toJstInput(Date.now() + 24 * 60 * 60 * 1000).slice(0, 10);
  return `${tomorrow}T12:00:00`;
}

export default async function NewReservationPage() {
  const [sites, accounts] = await Promise.all([api<Site[]>("/sites"), api<Account[]>("/accounts")]);
  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/reservations" className="muted" style={{ fontSize: "0.85rem" }}>
            ← 予約一覧
          </Link>
          <h1>予約を登録</h1>
          <p className="muted">
            公演と販売開始時刻を登録すると、当日カウントダウンと記録ができます
          </p>
        </div>
      </div>
      <ReservationForm sites={sites} accounts={accounts} defaultSaleStartsAt={tomorrowNoonJst()} />
    </>
  );
}
