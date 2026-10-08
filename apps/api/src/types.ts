import type { Db } from "./lib/db.js";

export type AppEnv = {
  Variables: {
    db: Db;
    encryptionKey: Buffer;
  };
};
