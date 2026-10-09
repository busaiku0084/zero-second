"use server";

import {
  type InvitationCreated,
  invitationCreateSchema,
  loginSchema,
  type PasswordResetCreated,
  passwordChangeSchema,
  passwordResetSchema,
  type SessionResponse,
  signupSchema,
} from "@zero-second/shared";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { type FormState, failure, formValues, withoutPasswords, zodErrors } from "@/lib/form";
import { safeNextPath } from "@/lib/next-path";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

/** ログイン・セットアップ・招待の受け入れで共通：API に送り、成功したら Cookie を入れて移動する */
async function startSession(
  path: string,
  body: unknown,
  values: Record<string, string>,
  next: string,
): Promise<FormState> {
  let session: SessionResponse;
  try {
    session = await api<SessionResponse>(path, { method: "POST", body, onUnauthorized: "throw" });
  } catch (e) {
    return failure(e, withoutPasswords(values));
  }
  await setSessionCookie(session.token, session.expiresAtMs);
  redirect(safeNextPath(next));
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return {
      message: "ログイン ID とパスワードを入力してください",
      fieldErrors: zodErrors(parsed.error),
      values: withoutPasswords(values),
    };
  }
  return startSession("/auth/login", parsed.data, values, values.next ?? "/");
}

function parseSignup(values: Record<string, string>): FormState | null {
  const fieldErrors: Record<string, string> = {};
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) Object.assign(fieldErrors, zodErrors(parsed.error));
  if (values.password !== values.passwordConfirm) {
    fieldErrors.passwordConfirm = "パスワードが一致しません";
  }
  if (Object.keys(fieldErrors).length === 0) return null;
  return { message: "入力内容を確認してください", fieldErrors, values: withoutPasswords(values) };
}

export async function setup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const invalid = parseSignup(values);
  if (invalid) return invalid;
  return startSession("/auth/setup", signupSchema.parse(values), values, "/");
}

export async function acceptInvitation(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const invalid = parseSignup(values);
  if (invalid) return invalid;
  return startSession(
    `/auth/invitations/${encodeURIComponent(token)}`,
    signupSchema.parse(values),
    values,
    "/",
  );
}

export async function resetPassword(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const parsed = passwordResetSchema.safeParse(values);
  const fieldErrors = parsed.success ? {} : zodErrors(parsed.error);
  if (values.password !== values.passwordConfirm) {
    fieldErrors.passwordConfirm = "パスワードが一致しません";
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { message: "入力内容を確認してください", fieldErrors };
  }
  return startSession(
    `/auth/password-resets/${encodeURIComponent(token)}`,
    parsed.data,
    values,
    "/",
  );
}

export async function logout(): Promise<void> {
  try {
    await api("/auth/logout", { method: "POST", onUnauthorized: "throw" });
  } catch {
    // セッションが既に無効でも、Cookie は消してログイン画面へ移す
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = passwordChangeSchema.safeParse(values);
  const fieldErrors = parsed.success ? {} : zodErrors(parsed.error);
  if (values.newPassword !== values.newPasswordConfirm) {
    fieldErrors.newPasswordConfirm = "新しいパスワードが一致しません";
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { message: "入力内容を確認してください", fieldErrors };
  }
  try {
    await api("/auth/password", { method: "PUT", body: parsed.data });
  } catch (e) {
    return failure(e, {});
  }
  return { ok: true, message: "パスワードを変更しました。ほかの端末はログアウトしました" };
}

// ---------- 招待（管理者） ----------

/** 招待リンクの URL。APP_URL があればそれを、無ければリクエストのホストを使う */
async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host") ?? "127.0.0.1:47300"}`;
}

export async function createInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = invitationCreateSchema.safeParse(values);
  if (!parsed.success) {
    return { message: "入力内容を確認してください", fieldErrors: zodErrors(parsed.error), values };
  }
  let created: InvitationCreated;
  try {
    created = await api<InvitationCreated>("/invitations", { method: "POST", body: parsed.data });
  } catch (e) {
    return failure(e, values);
  }
  revalidatePath("/users");
  return {
    ok: true,
    message: "招待リンクを作りました。リンクはこの画面でしか表示されません",
    link: `${await appOrigin()}/invite/${created.token}`,
  };
}

// ---------- ユーザー管理（管理者。ADR 0020） ----------

export async function createPasswordResetLink(userId: number): Promise<FormState> {
  let created: PasswordResetCreated;
  try {
    created = await api<PasswordResetCreated>(`/users/${userId}/password-reset`, {
      method: "POST",
    });
  } catch (e) {
    return failure(e, {});
  }
  return {
    ok: true,
    message: "再設定リンクを作りました。24 時間有効で、この画面でしか表示されません",
    link: `${await appOrigin()}/reset/${created.token}`,
  };
}

export async function updateUser(
  userId: number,
  body: { disabled?: boolean; role?: "admin" | "member" },
): Promise<FormState> {
  try {
    await api(`/users/${userId}`, { method: "PATCH", body });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/users");
  return { ok: true };
}

export async function revokeInvitation(id: number): Promise<FormState> {
  try {
    await api(`/invitations/${id}`, { method: "DELETE" });
  } catch (e) {
    return failure(e, {});
  }
  revalidatePath("/users");
  return { ok: true };
}
