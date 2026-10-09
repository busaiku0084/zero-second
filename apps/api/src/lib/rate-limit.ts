/**
 * ログインの失敗回数の制限（メモリ上。API を再起動すると消える）。
 * 同じログイン ID で window 内に max 回失敗したら、window が終わるまで受け付けない
 */
export class LoginLimiter {
  private failures = new Map<string, { count: number; firstAtMs: number }>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  private key(loginId: string): string {
    return loginId.trim().toLowerCase();
  }

  /** 受け付けない間は、解除までのミリ秒を返す */
  blockedForMs(loginId: string, now = Date.now()): number {
    const entry = this.failures.get(this.key(loginId));
    if (!entry) return 0;
    const remaining = entry.firstAtMs + this.windowMs - now;
    if (remaining <= 0) {
      this.failures.delete(this.key(loginId));
      return 0;
    }
    return entry.count >= this.max ? remaining : 0;
  }

  fail(loginId: string, now = Date.now()): void {
    const key = this.key(loginId);
    const entry = this.failures.get(key);
    if (!entry || entry.firstAtMs + this.windowMs <= now) {
      this.failures.set(key, { count: 1, firstAtMs: now });
    } else {
      entry.count += 1;
    }
  }

  succeed(loginId: string): void {
    this.failures.delete(this.key(loginId));
  }
}
