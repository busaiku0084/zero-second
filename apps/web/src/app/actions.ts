"use server";

import {
  type Account,
  accountCreateSchema,
  manualRunCreateSchema,
  type Reservation,
  reservationCreateSchema,
} from "@zero-second/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import {
  blankToUndefined,
  type FormState,
  failure,
  formValues,
  withoutPasswords,
  zodErrors,
} from "@/lib/form";
import { fromJstInput } from "@/lib/format";

// ---------- reservations ----------

export async function createReservation(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const saleStartsAtMs = fromJstInput(values.saleStartsAt ?? "");
  const parsed = reservationCreateSchema.safeParse({
    site: values.site,
    accountId: blankToUndefined(values.accountId) ? Number(values.accountId) : null,
    title: values.title,
    eventUrl: values.eventUrl,
    ticketType: values.ticketType,
    quantity: Number(values.quantity),
    paymentMethod: values.paymentMethod,
    saleStartsAtMs: saleStartsAtMs ?? 0,
    mode: values.mode,
    notes: values.notes ?? "",
  });
  if (!parsed.success || saleStartsAtMs === null) {
    const fieldErrors = parsed.success ? {} : zodErrors(parsed.error);
    if (saleStartsAtMs === null) fieldErrors.saleStartsAtMs = "販売開始日時を入力してください";
    return { message: "入力内容を確認してください", fieldErrors, values };
  }

  let created: Reservation;
  try {
    created = await api<Reservation>("/reservations", { method: "POST", body: parsed.data });
  } catch (e) {
    return failure(e, values);
  }
  revalidatePath("/", "layout");
  redirect(`/reservations/${created.id}`);
}

export async function cancelReservation(id: number, cancelled: boolean): Promise<FormState> {
  try {
    await api(`/reservations/${id}`, {
      method: "PATCH",
      body: { status: cancelled ? "cancelled" : "pending" },
    });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteReservation(id: number): Promise<FormState> {
  try {
    await api(`/reservations/${id}`, { method: "DELETE" });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/", "layout");
  redirect("/reservations");
}

// ---------- manual runs (#14) ----------

export async function recordManualRun(
  reservationId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const finishedAtMs = fromJstInput(values.finishedAt ?? "");
  const finishedMillis = Number(values.finishedMillis || 0);
  const dueAtMs = blankToUndefined(values.paymentDueAt)
    ? fromJstInput(values.paymentDueAt ?? "")
    : undefined;

  const parsed = manualRunCreateSchema.safeParse({
    result: values.result,
    finishedAtMs: finishedAtMs === null ? 0 : finishedAtMs + finishedMillis,
    orderId: blankToUndefined(values.orderId),
    paymentReference: blankToUndefined(values.paymentReference),
    paymentDueAtMs: dueAtMs ?? undefined,
    notes: blankToUndefined(values.notes),
  });
  if (!parsed.success || finishedAtMs === null || dueAtMs === null) {
    const fieldErrors = parsed.success ? {} : zodErrors(parsed.error);
    if (finishedAtMs === null) fieldErrors.finishedAtMs = "完了した日時を入力してください";
    if (dueAtMs === null) fieldErrors.paymentDueAtMs = "日時の形式が正しくありません";
    return { message: "入力内容を確認してください", fieldErrors, values };
  }

  try {
    await api(`/reservations/${reservationId}/manual-runs`, { method: "POST", body: parsed.data });
  } catch (e) {
    return failure(e, values);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- accounts ----------

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = accountCreateSchema.safeParse({
    site: values.site,
    loginId: values.loginId,
    password: values.password,
  });
  // パスワードはフォームに戻さない
  const safeValues = withoutPasswords(values);
  if (!parsed.success) {
    return {
      message: "入力内容を確認してください",
      fieldErrors: zodErrors(parsed.error),
      values: safeValues,
    };
  }
  try {
    await api<Account>("/accounts", { method: "POST", body: parsed.data });
  } catch (e) {
    return failure(e, safeValues);
  }
  revalidatePath("/accounts");
  return { ok: true, message: "アカウントを登録しました" };
}

export async function deleteAccount(id: number): Promise<FormState> {
  try {
    await api(`/accounts/${id}`, { method: "DELETE" });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/accounts");
  return { ok: true };
}
