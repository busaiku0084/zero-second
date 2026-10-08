import type { Context } from "hono";
import { z } from "zod";

export const idParam = z.object({ id: z.coerce.number().int().positive() });

type ValidationResult =
  | { success: true }
  | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } };

/** zValidator の失敗時に、項目ごとのエラーを 400 で返す */
export function validationHook(result: ValidationResult, c: Context) {
  if (!result.success) {
    return c.json(
      {
        error: "入力内容に誤りがあります",
        issues: result.error.issues.map((i) => ({
          path: i.path.map(String).join("."),
          message: i.message,
        })),
      },
      400,
    );
  }
}
