"use client";

import type { Timing } from "@zero-second/shared";
import { useId, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { niceTicks, useWidth } from "./useWidth";

/** 処理の段階ごとの色（dataviz のカテゴリ 3 色。4 つ目以降は「その他」にまとめる） */
const PHASES = [
  { id: "login", label: "ログイン", color: "var(--series-1)" },
  { id: "prepare", label: "事前準備", color: "var(--series-2)" },
  { id: "purchase", label: "購入", color: "var(--series-3)" },
] as const;
const OTHER = { id: "other", label: "その他", color: "var(--series-other)" };

function phaseOf(phase: string) {
  return PHASES.find((p) => p.id === phase) ?? OTHER;
}

const ROW = 30;
const BAR = 14;
const PAD = { top: 8, right: 72, bottom: 28, left: 8 };
const LABEL_W = 180;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 横棒の右端だけを丸めた形（左端は基準側なので角のまま） */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h / 2);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

/** 1 回の実行で送ったリクエストのウォーターフォール */
export function Waterfall({ timings }: { timings: Timing[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const origin = Math.min(...timings.map((t) => t.startedAtMs));
  const end = Math.max(...timings.map((t) => t.startedAtMs - origin + t.durationMs));
  const ticks = niceTicks(end, 4);
  const xMax = ticks[ticks.length - 1] || 1;
  const labelW = width < 520 ? 110 : LABEL_W;
  const plotLeft = PAD.left + labelW;
  const plotW = width - plotLeft - PAD.right;
  const x = (ms: number) => plotLeft + (ms / xMax) * plotW;
  const height = PAD.top + timings.length * ROW + PAD.bottom;

  const usedPhases = [
    ...new Map(timings.map((t) => [phaseOf(t.phase).id, phaseOf(t.phase)])).values(),
  ];
  const activeTiming = active === null ? null : timings[active];

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <div className="chart-head">
        <div>
          <h3>リクエストの内訳</h3>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            最初のリクエストを 0 とした経過時間
          </p>
        </div>
        <button
          type="button"
          className="link-button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? "グラフで見る" : "表で見る"}
        </button>
      </div>

      <div className="legend">
        {usedPhases.map((p) => (
          <span key={p.id} className="legend-item">
            <span className="legend-swatch" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>

      <div ref={wrapRef} className="chart-plot" hidden={showTable}>
        <svg
          className="chart-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`リクエスト ${timings.length} 件の所要時間`}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={PAD.top}
                y2={height - PAD.bottom}
                stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                strokeWidth={1}
              />
              <text x={x(t)} y={height - 8} textAnchor="middle">
                {formatDuration(t)}
              </text>
            </g>
          ))}
          {timings.map((t, i) => {
            const rowY = PAD.top + i * ROW;
            const barX = x(t.startedAtMs - origin);
            const barW = Math.max(2, x(t.startedAtMs - origin + t.durationMs) - barX);
            const phase = phaseOf(t.phase);
            const path = (() => {
              try {
                return new URL(t.url).pathname;
              } catch {
                return t.url;
              }
            })();
            return (
              <g
                key={t.id}
                role="button"
                tabIndex={0}
                aria-label={`${t.method} ${path} ${formatDuration(t.durationMs)}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                style={{ outline: "none" }}
              >
                <rect x={0} y={rowY} width={width} height={ROW} fill="transparent" />
                <text x={PAD.left} y={rowY + ROW / 2 + 4} style={{ fill: "var(--ink-2)" }}>
                  {truncate(`${t.method} ${path}`, Math.floor(labelW / 7))}
                </text>
                <path
                  d={barPath(barX, rowY + (ROW - BAR) / 2, barW, BAR)}
                  fill={phase.color}
                  opacity={active === null || active === i ? 1 : 0.45}
                />
                <text x={barX + barW + 6} y={rowY + ROW / 2 + 4} style={{ fill: "var(--ink-2)" }}>
                  {formatDuration(t.durationMs)}
                </text>
              </g>
            );
          })}
        </svg>
        {activeTiming && active !== null ? (
          <div
            className="tooltip"
            style={{
              left: Math.min(width - 90, Math.max(90, x(activeTiming.startedAtMs - origin))),
              top: PAD.top + active * ROW,
            }}
            role="status"
          >
            <div className="tooltip-value">
              <span
                className="tooltip-key"
                style={{ background: phaseOf(activeTiming.phase).color }}
              />
              {formatDuration(activeTiming.durationMs)}
            </div>
            <div style={{ overflowWrap: "anywhere" }}>
              {activeTiming.method} {activeTiming.url}
            </div>
            <div className="muted">
              {phaseOf(activeTiming.phase).label} ・ 開始 +
              {formatDuration(activeTiming.startedAtMs - origin)}
              {activeTiming.status !== null ? ` ・ ${activeTiming.status}` : ""}
            </div>
          </div>
        ) : null}
      </div>

      <div id={tableId} className="table-wrap" hidden={!showTable}>
        <table>
          <thead>
            <tr>
              <th>段階</th>
              <th>リクエスト</th>
              <th className="num">ステータス</th>
              <th className="num">開始</th>
              <th className="num">所要時間</th>
            </tr>
          </thead>
          <tbody>
            {timings.map((t) => (
              <tr key={t.id}>
                <td>{phaseOf(t.phase).label}</td>
                <td style={{ overflowWrap: "anywhere" }}>
                  {t.method} {t.url}
                </td>
                <td className="num">{t.status ?? "—"}</td>
                <td className="num">+{formatDuration(t.startedAtMs - origin)}</td>
                <td className="num">{formatDuration(t.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
