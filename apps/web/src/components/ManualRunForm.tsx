"use client";

import { useActionState, useRef, useState } from "react";
import { type FormState, recordManualRun } from "@/app/actions";
import { formatElapsed, toJstInput } from "@/lib/format";
import { RESULT_LABELS } from "@/lib/labels";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

/**
 * 手で購入した結果を記録する（#14）。
 * 「今を記録」を押した瞬間の時刻をミリ秒まで控え、販売開始からの所要時間を出す。
 */
export function ManualRunForm({
  reservationId,
  saleStartsAtMs,
}: {
  reservationId: number;
  saleStartsAtMs: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    recordManualRun.bind(null, reservationId),
    {},
  );
  const e = state.fieldErrors ?? {};
  const [stamp, setStamp] = useState<number | null>(null);
  const finishedRef = useRef<HTMLInputElement>(null);

  function stampNow() {
    const now = Date.now();
    setStamp(now);
    if (finishedRef.current) finishedRef.current.value = toJstInput(now);
  }

  return (
    <form action={action} className="form" noValidate>
      <div className="stack" style={{ gap: 10 }}>
        <button type="button" className="button button-primary" onClick={stampNow}>
          今を購入完了として記録
        </button>
        <p className="muted" style={{ fontSize: "0.8rem" }}>
          {stamp !== null ? (
            <>
              販売開始から <span className="mono">{formatElapsed(stamp - saleStartsAtMs)}</span>
            </>
          ) : (
            "購入が終わった瞬間に押すと、ミリ秒まで記録します"
          )}
        </p>
      </div>

      <FormMessage message={state.message} ok={state.ok} />

      <div className="form-grid">
        <Field id={`result-${reservationId}`} label="結果" error={e.result}>
          <select id={`result-${reservationId}`} name="result" defaultValue="succeeded">
            {Object.entries(RESULT_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`finishedAt-${reservationId}`}
          label="完了日時（日本時間）"
          error={e.finishedAtMs}
        >
          <input
            ref={finishedRef}
            id={`finishedAt-${reservationId}`}
            name="finishedAt"
            type="datetime-local"
            step={1}
            required
          />
        </Field>
        <input type="hidden" name="finishedMillis" value={stamp === null ? 0 : stamp % 1000} />
        <Field id={`paymentReference-${reservationId}`} label="払込番号" error={e.paymentReference}>
          <input
            id={`paymentReference-${reservationId}`}
            name="paymentReference"
            autoComplete="off"
          />
        </Field>
        <Field id={`paymentDueAt-${reservationId}`} label="支払期限" error={e.paymentDueAtMs}>
          <input id={`paymentDueAt-${reservationId}`} name="paymentDueAt" type="datetime-local" />
        </Field>
        <Field id={`notes-run-${reservationId}`} label="メモ" wide>
          <input
            id={`notes-run-${reservationId}`}
            name="notes"
            placeholder="例: 2 回目のアクセスで購入画面へ"
          />
        </Field>
      </div>
      <div className="button-row">
        <SubmitButton pendingLabel="保存しています…" variant="default">
          結果を保存
        </SubmitButton>
      </div>
    </form>
  );
}
