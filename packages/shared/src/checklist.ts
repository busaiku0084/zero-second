import { z } from "zod";
import type { ReservationMode } from "./schemas";
import { findSite } from "./sites";

/**
 * 購入前チェックリストのテンプレート（#13）。予約を作るときに入る。
 * サイトごとの項目が要るときは、ここでサイトの id ごとに足す
 */
export function checklistTemplate(siteId: string, mode: ReservationMode): string[] {
  const site = findSite(siteId);
  const name = site?.name ?? "サイト";
  return [
    `${name}にログインできることを確かめた`,
    "会員情報（氏名・電話番号など）が最新になっている",
    "支払い方法を選べることを確かめた",
    "購入する枚数と、同行者の情報を決めた",
    "販売開始の通知が届くようにした",
    mode === "auto"
      ? "予約にアカウントを指定した（自動購入）"
      : "販売開始の少し前に、公演ページを開ける端末を用意した",
  ];
}

export const checklistItemCreateSchema = z.object({
  label: z.string().trim().min(1).max(200),
});

export const checklistItemUpdateSchema = z.object({ done: z.boolean() });

export type ChecklistItem = {
  id: number;
  label: string;
  done: boolean;
  doneAtMs: number | null;
};
