import type { Invitation, User } from "@zero-second/shared";
import type { Metadata } from "next";
import { revokeInvitation } from "@/app/auth-actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { InvitationForm } from "@/components/InvitationForm";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { INVITATION_LABELS, ROLE_LABELS } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "ユーザー" };

function invitationState(i: Invitation, now: number): keyof typeof INVITATION_LABELS {
  if (i.acceptedAtMs !== null) return "accepted";
  return i.expiresAtMs <= now ? "expired" : "open";
}

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, invitations] = await Promise.all([
    api<User[]>("/users"),
    api<Invitation[]>("/invitations"),
  ]);
  const now = Date.now();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>ユーザー</h1>
          <p className="muted">
            招待とユーザーの一覧（管理者のみ）。ほかのユーザーの予約・アカウント・結果は、管理者にも見えません
          </p>
        </div>
      </div>

      <section className="section">
        <h2>招待する</h2>
        <div className="panel">
          <InvitationForm />
        </div>
      </section>

      <section className="section">
        <h2>招待リンク</h2>
        {invitations.length > 0 ? (
          <div className="panel table-wrap" style={{ padding: "16px 8px" }}>
            <table>
              <thead>
                <tr>
                  <th>状態</th>
                  <th>メモ</th>
                  <th>作成</th>
                  <th>期限</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitations.map((i) => {
                  const state = invitationState(i, now);
                  const label = INVITATION_LABELS[state];
                  return (
                    <tr key={i.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={`pill tone-${label.tone}`}>
                          <Icon name={label.icon} />
                          {label.label}
                        </span>
                        {i.acceptedByLoginId ? (
                          <span className="mono muted"> {i.acceptedByLoginId}</span>
                        ) : null}
                      </td>
                      <td style={{ overflowWrap: "anywhere" }}>{i.note || "—"}</td>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(i.createdAtMs)}
                      </td>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {state === "accepted" ? "—" : formatDateTime(i.expiresAtMs)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {state === "open" ? (
                          <ConfirmButton
                            label="取り消す"
                            confirmLabel="取り消す"
                            pendingLabel="取り消しています…"
                            onConfirm={revokeInvitation.bind(null, i.id)}
                            danger
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="招待はまだありません">
            上のフォームで招待リンクを作り、使ってほしい人に送ります。
          </EmptyState>
        )}
      </section>

      <section className="section">
        <h2>ユーザー</h2>
        <div className="panel table-wrap" style={{ padding: "16px 8px" }}>
          <table>
            <thead>
              <tr>
                <th>ログイン ID</th>
                <th>権限</th>
                <th>登録日</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="mono" style={{ overflowWrap: "anywhere" }}>
                    {u.loginId}
                    {u.id === me.id ? <span className="muted">（自分）</span> : null}
                  </td>
                  <td>
                    <span className="tag">{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    {formatDateTime(u.createdAtMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
