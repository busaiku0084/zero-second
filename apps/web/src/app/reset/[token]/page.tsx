import type { Metadata } from "next";
import Link from "next/link";
import { resetPassword } from "@/app/auth-actions";
import { AuthCard } from "@/components/AuthCard";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "パスワードの再設定" };

export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const reset = await api<{ valid: boolean; loginId?: string }>(
    `/auth/password-resets/${encodeURIComponent(token)}`,
    { onUnauthorized: "throw" },
  );

  if (!reset.valid) {
    return (
      <AuthCard
        eyebrow="RESET"
        title="この再設定リンクは使えません"
        lead="期限が切れたか、すでに使われています。管理者に新しいリンクを頼んでください。"
      >
        <Link href="/login" className="button">
          ログイン画面へ
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="RESET"
      title="パスワードの再設定"
      lead={
        <>
          <span className="mono">{reset.loginId}</span>{" "}
          の新しいパスワードを決めてください。ほかの端末はログアウトされます。
        </>
      }
    >
      <ResetPasswordForm action={resetPassword.bind(null, token)} />
    </AuthCard>
  );
}
