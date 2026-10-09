// Server Actions の共通処理（フォームの値の取り出し・エラーの変換）

import type { z } from "zod";
import { ApiError, ApiUnavailableError } from "./api";

export type FormState = {
  message?: string;
  fieldErrors?: Record<string, string>;
  /** 送信した値。エラー時にフォームへ戻す */
  values?: Record<string, string>;
  ok?: boolean;
  /** 作った招待リンク（このときだけ表示できる） */
  link?: string;
};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  }
  return values;
}

/** パスワードの項目をフォームに戻さないように取り除く */
export function withoutPasswords(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([k]) => !/password/i.test(k)));
}

export function zodErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

export function failure(e: unknown, values: Record<string, string>): FormState {
  if (e instanceof ApiError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[i.path] ??= i.message;
    return { message: e.message, fieldErrors, values };
  }
  if (e instanceof ApiUnavailableError) {
    return { message: `${e.message}。make dev-api で起動してください`, values };
  }
  throw e;
}

/** 空文字は未入力として扱う */
export const blankToUndefined = (v: string | undefined) =>
  v === undefined || v.trim() === "" ? undefined : v;
