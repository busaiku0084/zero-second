import type { User } from "@zero-second/shared";
import type { Db } from "./lib/db.js";
import type { LoginLimiter } from "./lib/rate-limit.js";
import type { NotificationService } from "./notify/service.js";

export type AppEnv = {
  Variables: {
    db: Db;
    encryptionKey: Buffer;
    loginLimiter: LoginLimiter;
    notifications: NotificationService;
    /** Web Push の公開鍵（未設定なら null） */
    pushPublicKey: string | null;
    /** ログイン中のユーザー。公開のルート（PUBLIC_PATHS）以外では必ず入っている */
    user: User;
    /** リクエストの x-session-token（ログアウト用） */
    sessionToken: string;
  };
};
