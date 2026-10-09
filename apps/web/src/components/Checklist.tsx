"use client";

import type { ChecklistItem } from "@zero-second/shared";
import { useActionState, useOptimistic, useRef, useTransition } from "react";
import {
  addChecklistItem,
  deleteChecklistItem,
  restoreChecklistTemplate,
  toggleChecklistItem,
} from "@/app/checklist-actions";
import type { FormState } from "@/lib/form";
import { Icon } from "./Icon";

/** 購入前チェックリスト（#13）。editable が false なら、チェックだけできる（ランチャー用） */
export function Checklist({
  reservationId,
  items,
  editable = true,
}: {
  reservationId: number;
  items: ChecklistItem[];
  editable?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    items,
    (current, change: { id: number; done?: boolean; removed?: boolean }) =>
      change.removed
        ? current.filter((i) => i.id !== change.id)
        : current.map((i) => (i.id === change.id ? { ...i, done: change.done ?? i.done } : i)),
  );
  const [, startTransition] = useTransition();
  const [addState, addAction, adding] = useActionState<FormState, FormData>(
    addChecklistItem.bind(null, reservationId),
    {},
  );
  const form = useRef<HTMLFormElement>(null);
  const done = optimistic.filter((i) => i.done).length;
  const complete = optimistic.length > 0 && done === optimistic.length;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="button-row">
        {complete ? (
          <span className="pill tone-good">
            <Icon name="check" />
            準備完了
          </span>
        ) : (
          <span className="pill tone-neutral">
            {done} / {optimistic.length} 済み
          </span>
        )}
      </div>

      {optimistic.length > 0 ? (
        <ul className="checklist">
          {optimistic.map((item) => (
            <li key={item.id}>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => {
                    const next = e.currentTarget.checked;
                    startTransition(async () => {
                      setOptimistic({ id: item.id, done: next });
                      await toggleChecklistItem(reservationId, item.id, next);
                    });
                  }}
                />
                <span>{item.label}</span>
              </label>
              {editable ? (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`「${item.label}」を消す`}
                  onClick={() =>
                    startTransition(async () => {
                      setOptimistic({ id: item.id, removed: true });
                      await deleteChecklistItem(reservationId, item.id);
                    })
                  }
                >
                  <Icon name="cross" size={12} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">項目はありません。</p>
      )}

      {editable ? (
        <div className="stack" style={{ gap: 8 }}>
          <form
            ref={form}
            action={async (fd) => {
              await addAction(fd);
              form.current?.reset();
            }}
            className="input-row"
          >
            <input
              name="label"
              placeholder="項目を足す（例: 同行者に枚数を確認）"
              maxLength={200}
              aria-label="足す項目"
              aria-invalid={Boolean(addState.fieldErrors?.label)}
            />
            <button type="submit" className="button" disabled={adding}>
              足す
            </button>
          </form>
          {addState.message ? (
            <p className="field-error" role="alert">
              {addState.message}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              className="link-button"
              onClick={() => startTransition(() => void restoreChecklistTemplate(reservationId))}
            >
              テンプレートの項目を戻す
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
