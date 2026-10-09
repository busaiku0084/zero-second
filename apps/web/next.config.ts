import { resolve } from "node:path";
import type { NextConfig } from "next";

// API と同じく、リポジトリ直下の .env を読む（無ければ環境変数のみ）
try {
  process.loadEnvFile(resolve(import.meta.dirname, "../../.env"));
} catch {
  // .env が無い場合はそのまま進める
}

const nextConfig: NextConfig = {
  transpilePackages: ["@zero-second/shared"],
  // Docker の開発環境では next dev が 0.0.0.0 で待ち受けるため、127.0.0.1 からの HMR が
  // 別オリジン扱いでブロックされ、画面が動かなくなる（クライアントの処理が始まらない）。ホストからの分だけ許可する
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
