import type { NotificationService } from "./service.js";

/** 数秒おきに通知を作って届ける（API のプロセスの中で動く。ADR 0017） */
export class Notifier {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly service: NotificationService,
    private readonly intervalMs = 5_000,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    void this.tick();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  /** 前回の送信が終わっていなければ何もしない */
  async tick(now = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const created = this.service.collect(now);
      await Promise.all(created.map((n) => this.service.deliver(n)));
    } catch (e) {
      console.error("通知の処理に失敗しました", e);
    } finally {
      this.running = false;
    }
  }
}
