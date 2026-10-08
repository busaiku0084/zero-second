import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** CREDENTIALS_ENCRYPTION_KEY（base64 の 32 バイト）を読み込む */
export function parseKey(base64: string | undefined): Buffer {
  if (!base64) throw new Error("CREDENTIALS_ENCRYPTION_KEY が設定されていません");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY は 32 バイトにしてください");
  return key;
}

/** AES-256-GCM で暗号化する。保存形式は iv(12) | tag(16) | ciphertext */
export function encrypt(key: Buffer, plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(key: Buffer, data: Uint8Array): string {
  const buf = Buffer.from(data);
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(buf.subarray(IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8");
}
