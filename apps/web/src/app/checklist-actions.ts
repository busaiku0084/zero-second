"use server";

import { checklistItemCreateSchema } from "@zero-second/shared";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { type FormState, failure, formValues, zodErrors } from "@/lib/form";

function refresh(reservationId: number) {
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath(`/reservations/${reservationId}/launch`);
  revalidatePath("/reservations");
}

export async function toggleChecklistItem(
  reservationId: number,
  itemId: number,
  done: boolean,
): Promise<FormState> {
  try {
    await api(`/reservations/${reservationId}/checklist/${itemId}`, {
      method: "PATCH",
      body: { done },
    });
  } catch (e) {
    return failure(e, {});
  }
  refresh(reservationId);
  return { ok: true };
}

export async function addChecklistItem(
  reservationId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const parsed = checklistItemCreateSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: zodErrors(parsed.error), values };
  try {
    await api(`/reservations/${reservationId}/checklist`, { method: "POST", body: parsed.data });
  } catch (e) {
    return failure(e, values);
  }
  refresh(reservationId);
  return { ok: true };
}

export async function deleteChecklistItem(
  reservationId: number,
  itemId: number,
): Promise<FormState> {
  try {
    await api(`/reservations/${reservationId}/checklist/${itemId}`, { method: "DELETE" });
  } catch (e) {
    return failure(e, {});
  }
  refresh(reservationId);
  return { ok: true };
}

export async function restoreChecklistTemplate(reservationId: number): Promise<FormState> {
  try {
    await api(`/reservations/${reservationId}/checklist/template`, { method: "POST" });
  } catch (e) {
    return failure(e, {});
  }
  refresh(reservationId);
  return { ok: true };
}
