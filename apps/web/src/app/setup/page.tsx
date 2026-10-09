import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setup } from "@/app/auth-actions";
import { AuthCard } from "@/components/AuthCard";
import { SignupForm } from "@/components/SignupForm";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "初回セットアップ" };

export default async function SetupPage() {
  const { required } = await api<{ required: boolean }>("/auth/setup", {
    onUnauthorized: "throw",
  });
  if (!required) redirect("/login");

  return (
    <AuthCard
      eyebrow="SETUP"
      title="最初のユーザーを作る"
      lead="このユーザーが管理者になります。ほかの人は、管理者が招待リンクを送って追加します。"
      footer="登録済みの予約・アカウント・結果は、このユーザーに引き継がれます"
    >
      <SignupForm action={setup} submitLabel="管理者として登録" />
    </AuthCard>
  );
}
