import type { ReservationStatus, RunResult } from "@zero-second/shared";
import { RESULT_LABELS, STATUS_LABELS } from "@/lib/labels";
import { Icon } from "./Icon";

export function StatusPill({ status }: { status: ReservationStatus }) {
  const s = STATUS_LABELS[status];
  return (
    <span className={`pill tone-${s.tone}`}>
      <Icon name={s.icon} />
      {s.label}
    </span>
  );
}

export function ResultPill({ result }: { result: RunResult | null }) {
  if (result === null) return <span className="pill tone-neutral">記録なし</span>;
  const s = RESULT_LABELS[result];
  return (
    <span className={`pill tone-${s.tone}`}>
      <Icon name={s.icon} />
      {s.label}
    </span>
  );
}
