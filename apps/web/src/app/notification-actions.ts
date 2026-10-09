"use server";

import {
  pushSubscriptionSchema,
  reminderMinutesSchema,
  webhookUpdateSchema,
} from "@zero-second/shared";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { type FormState, failure, formValues, zodErrors } from "@/lib/form";

export async function markAllNotificationsRead(): Promise<void> {
  await api("/notifications/read", { method: "POST" });
  revalidatePath("/", "layout");
}

export async function updateReminders(
  reservationId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = reminderMinutesSchema.safeParse(formData.getAll("reminderMinutes").map(Number));
  if (!parsed.success) return { message: "通知のタイミングを確認してください" };
  try {
    await api(`/reservations/${reservationId}`, {
      method: "PATCH",
      body: { reminderMinutes: parsed.data },
    });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath(`/reservations/${reservationId}`);
  return { ok: true, message: "通知のタイミングを保存しました" };
}

export async function saveWebhook(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = webhookUpdateSchema.safeParse({ webhookUrl: values.webhookUrl ?? "" });
  if (!parsed.success) {
    // URL は秘密の値なので、エラー時もフォームに戻さない
    return { message: "入力内容を確認してください", fieldErrors: zodErrors(parsed.error) };
  }
  try {
    await api("/notifications/webhook", { method: "PUT", body: parsed.data });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/settings");
  return { ok: true, message: "Webhook を設定しました" };
}

export async function removeWebhook(): Promise<FormState> {
  try {
    await api("/notifications/webhook", { method: "PUT", body: { webhookUrl: null } });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/settings");
  return { ok: true };
}

/** ブラウザ（PushManager）の購読を API に登録・解除する */
export async function savePushSubscription(subscription: unknown): Promise<FormState> {
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { message: "このブラウザの購読の形式に対応していません" };
  try {
    await api("/notifications/push-subscriptions", { method: "POST", body: parsed.data });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<FormState> {
  try {
    await api("/notifications/push-subscriptions", { method: "DELETE", body: { endpoint } });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/settings");
  return { ok: true };
}

const STATUS_TEXT = { sent: "送信しました", failed: "失敗しました", skipped: "未設定" } as const;

export async function sendTestNotification(): Promise<FormState> {
  let result: { pushStatus: keyof typeof STATUS_TEXT; webhookStatus: keyof typeof STATUS_TEXT };
  try {
    result = await api("/notifications/test", { method: "POST" });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/", "layout");
  const failed = result.pushStatus === "failed" || result.webhookStatus === "failed";
  return {
    ok: !failed,
    message: `ブラウザ: ${STATUS_TEXT[result.pushStatus]} / Webhook: ${STATUS_TEXT[result.webhookStatus]}`,
  };
}
