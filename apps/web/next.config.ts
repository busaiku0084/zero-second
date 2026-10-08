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
};

export default nextConfig;
