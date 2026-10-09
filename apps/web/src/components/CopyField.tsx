"use client";

import { useRef, useState } from "react";

/** 読み取り専用の値とコピーボタン。クリップボードが使えなければ選択状態にする */
export function CopyField({ id, value }: { id: string; value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="input-row">
      <input
        ref={ref}
        id={id}
        className="mono"
        value={value}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="button"
        onClick={() => {
          navigator.clipboard
            .writeText(value)
            .then(() => setCopied(true))
            .catch(() => ref.current?.select());
        }}
      >
        {copied ? "コピーしました" : "コピー"}
      </button>
    </div>
  );
}
