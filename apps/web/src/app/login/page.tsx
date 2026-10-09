import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "@/components/LoginForm";
import { api } from "@/lib/api";
import { safeNextPath } from "@/lib/next-path";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(typeof rawNext === "string" ? rawNext : undefined);

  const { required } = await api<{ required: boolean }>("/auth/setup", {
    onUnauthorized: "throw",
  });
  if (required) redirect("/setup");
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthCard
      eyebrow="SIGN IN"
      title="ログイン"
      footer="アカウントは招待制です。使いたい場合は管理者に招待リンクを頼んでください"
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
