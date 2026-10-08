import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <EmptyState
      title="ページが見つかりません"
      action={
        <Link href="/" className="button">
          ダッシュボードへ
        </Link>
      }
    >
      削除された予約か、URL が間違っている可能性があります。
    </EmptyState>
  );
}
