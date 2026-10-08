"use client";

import type { DashboardSummary } from "@zero-second/shared";
import Link from "next/link";
import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from "react";
import { formatDateTime, formatElapsed, formatShortDate } from "@/lib/format";
import { niceTicks, useWidth } from "./useWidth";

type Point = DashboardSummary["series"][number];

const HEIGHT = 240; // x 軸の帯を含めた高さ
const PAD = { top: 16, right: 76, bottom: 28, left: 48 };

/** 成功した購入の所要時間（販売開始 → 完了）の推移。系列は 1 本なので凡例は置かない */
export function ElapsedChart({ points }: { points: Point[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const xs = points.map((p) => p.startedAtMs);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanX = maxX - minX || 1;
  const x = (ms: number) =>
    points.length === 1 ? PAD.left + plotW / 2 : PAD.left + ((ms - minX) / spanX) * plotW;

  const yTicksSec = niceTicks(Math.max(...points.map((p) => p.elapsedMs)) / 1000);
  const yMax = (yTicksSec[yTicksSec.length - 1] ?? 1) * 1000 || 1000;
  const y = (ms: number) => PAD.top + plotH - (ms / yMax) * plotH;

  const linePath = points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"}${x(p.startedAtMs).toFixed(1)},${y(p.elapsedMs).toFixed(1)}`,
    )
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath =
    first && last
      ? `${linePath} L${x(last.startedAtMs).toFixed(1)},${y(0)} L${x(first.startedAtMs).toFixed(1)},${y(0)} Z`
      : "";

  // x 軸の日付は最大 5 つ、重ならないように間引く
  const xLabelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 90))));

  function nearest(clientX: number, rect: DOMRect): number {
    const px = clientX - rect.left;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.startedAtMs) - px);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    setActive((cur) =>
      Math.min(points.length - 1, Math.max(0, (cur ?? points.length - 1) + delta)),
    );
  }

  const activePoint = active === null ? null : points[active];

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <div className="chart-head">
        <div>
          <h3>成功までの所要時間</h3>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            販売開始から購入完了まで。点の上で詳細、←→ キーでも移動できます
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

      <div ref={wrapRef} className="chart-plot" hidden={showTable}>
        <svg
          className="chart-svg"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`成功までの所要時間の推移。${points.length} 件`}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {yTicksSec.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t * 1000)}
                y2={y(t * 1000)}
                stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(t * 1000) + 4} textAnchor="end">
                {t}s
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % xLabelEvery === 0 ? (
              <text key={p.runId} x={x(p.startedAtMs)} y={HEIGHT - 8} textAnchor="middle">
                {formatShortDate(p.startedAtMs)}
              </text>
            ) : null,
          )}

          <path d={areaPath} fill="var(--series-1)" fillOpacity={0.1} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {activePoint ? (
            <line
              x1={x(activePoint.startedAtMs)}
              x2={x(activePoint.startedAtMs)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
          ) : null}

          {points.map((p, i) => (
            <circle
              key={p.runId}
              cx={x(p.startedAtMs)}
              cy={y(p.elapsedMs)}
              r={i === active ? 5.5 : 4}
              fill="var(--series-1)"
              stroke="var(--chart-surface)"
              strokeWidth={2}
            />
          ))}

          {last ? (
            <text
              x={x(last.startedAtMs) + 10}
              y={y(last.elapsedMs) + 4}
              textAnchor="start"
              style={{ fill: "var(--ink)", fontWeight: 600 }}
            >
              {formatElapsed(last.elapsedMs)}
            </text>
          ) : null}
        </svg>

        {activePoint ? (
          <div
            className="tooltip"
            style={{ left: x(activePoint.startedAtMs), top: y(activePoint.elapsedMs) }}
            role="status"
          >
            <div className="tooltip-value">
              <span className="tooltip-key" style={{ background: "var(--series-1)" }} />
              {formatElapsed(activePoint.elapsedMs)}
            </div>
            <div>{activePoint.title}</div>
            <div className="muted mono">{formatDateTime(activePoint.startedAtMs)}</div>
          </div>
        ) : null}
      </div>

      <div id={tableId} className="table-wrap" hidden={!showTable}>
        <table>
          <thead>
            <tr>
              <th>公演</th>
              <th>販売開始</th>
              <th className="num">所要時間</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.runId}>
                <td>
                  <Link href={`/reservations/${p.reservationId}`}>{p.title}</Link>
                </td>
                <td className="mono">{formatDateTime(p.startedAtMs)}</td>
                <td className="num">{formatElapsed(p.elapsedMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
