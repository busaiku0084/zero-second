// 端末の時計とサーバーの時計のずれの推定（ADR 0018）

/** 1 回の測定。t0 / t1 は端末の時計で、送る直前と受け取った直後。server はサーバーの時計 */
export type ClockSample = { t0: number; t1: number; server: number };

export type ClockOffset = {
  /** サーバー − 端末（ミリ秒）。正なら端末の時計が遅れている */
  offsetMs: number;
  /** 推定の誤差の幅（± ミリ秒）。往復時間の半分 */
  uncertaintyMs: number;
};

/**
 * サーバーが応答を作ったのは往復の真ん中あたり、とみなしてずれを出す。
 * 往復時間がいちばん短い測定を使う（途中で待たされた測定ほど誤差が大きい）
 */
export function estimateOffset(samples: ClockSample[]): ClockOffset | null {
  const valid = samples.filter((s) => s.t1 >= s.t0);
  if (valid.length === 0) return null;
  const best = valid.reduce((a, b) => (b.t1 - b.t0 < a.t1 - a.t0 ? b : a));
  const rtt = best.t1 - best.t0;
  return {
    offsetMs: Math.round(best.server - (best.t0 + best.t1) / 2),
    uncertaintyMs: Math.ceil(rtt / 2),
  };
}

/** 「端末の時計が 0.123 秒 遅れています」など */
export function describeOffset({ offsetMs, uncertaintyMs }: ClockOffset): string {
  const seconds = (Math.abs(offsetMs) / 1000).toFixed(3);
  const margin = `±${(uncertaintyMs / 1000).toFixed(3)} 秒`;
  if (Math.abs(offsetMs) <= uncertaintyMs) return `端末の時計は正確です（${margin}）`;
  return `端末の時計が ${seconds} 秒${offsetMs > 0 ? "遅れて" : "進んで"}います。補正して表示しています（${margin}）`;
}
