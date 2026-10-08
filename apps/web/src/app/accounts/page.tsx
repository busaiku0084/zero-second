import { type Account, findSite, type Site } from "@zero-second/shared";
import type { Metadata } from "next";
import { deleteAccount } from "@/app/actions";
import { AccountForm } from "@/components/AccountForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "アカウント" };

export default async function AccountsPage() {
  const [sites, accounts] = await Promise.all([api<Site[]>("/sites"), api<Account[]>("/accounts")]);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>アカウント</h1>
          <p className="muted">サイトごとのログイン情報。パスワードは暗号化して保存します</p>
        </div>
      </div>

      <section className="section">
        <h2>登録済み</h2>
        {accounts.length > 0 ? (
          <div className="panel table-wrap" style={{ padding: "16px 8px" }}>
            <table>
              <thead>
                <tr>
                  <th>サイト</th>
                  <th>ログイン ID</th>
                  <th>登録日</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{findSite(a.site)?.name ?? a.site}</td>
                    <td className="mono" style={{ overflowWrap: "anywhere" }}>
                      {a.loginId}
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(a.createdAtMs)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <ConfirmButton
                        label="削除"
                        confirmLabel="削除する"
                        pendingLabel="削除しています…"
                        onConfirm={deleteAccount.bind(null, a.id)}
                        danger
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="アカウントはまだありません">
            手動で購入するだけなら登録は不要です。自動購入に対応したサイトを使うときに登録します。
          </EmptyState>
        )}
      </section>

      <section className="section">
        <h2>アカウントを追加</h2>
        <div className="panel">
          <AccountForm sites={sites} />
        </div>
      </section>
    </>
  );
}
