import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitation } from "@/app/auth-actions";
import { AuthCard } from "@/components/AuthCard";
import { SignupForm } from "@/components/SignupForm";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "招待" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { valid } = await api<{ valid: boolean }>(
    `/auth/invitations/${encodeURIComponent(token)}`,
    { onUnauthorized: "throw" },
  );

  if (!valid) {
    return (
      <AuthCard
        eyebrow="INVITATION"
        title="この招待リンクは使えません"
        lead="期限が切れたか、すでに使われています。招待してくれた人に新しいリンクを頼んでください。"
      >
        <Link href="/login" className="button">
          ログイン画面へ
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="INVITATION"
      title="zero-second に参加する"
      lead="ログイン ID とパスワードを決めてください。予約や結果は、ほかのユーザーからは見えません。"
    >
      <SignupForm action={acceptInvitation.bind(null, token)} submitLabel="登録してはじめる" />
    </AuthCard>
  );
}
