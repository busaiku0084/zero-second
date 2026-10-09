import type { User } from "@zero-second/shared";
import type { Db } from "./lib/db.js";
import type { LoginLimiter } from "./lib/rate-limit.js";

export type AppEnv = {
  Variables: {
    db: Db;
    encryptionKey: Buffer;
    loginLimiter: LoginLimiter;
    /** ログイン中のユーザー。公開のルート（PUBLIC_PATHS）以外では必ず入っている */
    user: User;
    /** リクエストの x-session-token（ログアウト用） */
    sessionToken: string;
  };
};
