"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHROME, networkColor, networkLabel } from "./palette";
import { formatNumber } from "@/lib/utils";
import type { SeriesPoint } from "@/lib/analytics";

/**
 * Change over time, one line per network.
 *
 * Two of the palette slots sit below 3:1 against the white surface, so per the
 * dataviz relief rule this chart never leans on stroke colour alone: every
 * series carries a direct end-label, a legend is always present, and a table
 * view is one tap away.
 */
export function TrendChart({
  points,
  networks,
  title,
  height = 260,
}: {
  points: SeriesPoint[];
  networks: string[];
  title: string;
  height?: number;
}) {
  const [asTable, setAsTable] = useState(false);

  if (points.length === 0) {
    return null;
  }

  const lastIndex = points.length - 1;

  return (
    <figure className="rounded-[20px] border border-ink-200 bg-white p-4 shadow-lift">
      <figcaption className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-body font-semibold text-ink-900">{title}</h3>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="rounded-full px-2.5 py-1 text-small font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        >
          {asTable ? "Chart" : "Table"}
        </button>
      </figcaption>

      {asTable ? (
        <DataTable points={points} networks={networks} />
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 76, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHROME.grid} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: CHROME.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: CHROME.axis }}
                minTickGap={28}
                tickFormatter={(d: string) => d.slice(5).replace("-", "/")}
              />
              <YAxis
                tick={{ fill: CHROME.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <Tooltip
                cursor={{ stroke: CHROME.axis, strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${CHROME.grid}`,
                  boxShadow: "0 8px 32px rgb(12 10 9 / 0.14)",
                  fontSize: 12,
                }}
                labelStyle={{ color: CHROME.ink, fontWeight: 600 }}
                formatter={(value, name) => [
                  formatNumber(Number(value)),
                  networkLabel(String(name)),
                ]}
              />
              <Legend
                verticalAlign="top"
                align="left"
                height={28}
                iconType="plainline"
                formatter={(value: string) => (
                  <span style={{ color: CHROME.ink, fontSize: 12 }}>
                    {networkLabel(value)}
                  </span>
                )}
              />
              {networks.map((network) => (
                <Line
                  key={network}
                  type="monotone"
                  dataKey={network}
                  stroke={networkColor(network)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: CHROME.surface }}
                  isAnimationActive={false}
                  label={(props: {
                    x?: string | number;
                    y?: string | number;
                    index?: number;
                  }) =>
                    props.index === lastIndex && props.x != null && props.y != null ? (
                      <text
                        key={`${network}-end`}
                        x={Number(props.x) + 8}
                        y={Number(props.y)}
                        fill={networkColor(network)}
                        fontSize={11}
                        fontWeight={600}
                        dominantBaseline="middle"
                      >
                        {networkLabel(network)}
                      </text>
                    ) : (
                      <g key={`${network}-${props.index}`} />
                    )
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

function DataTable({ points, networks }: { points: SeriesPoint[]; networks: string[] }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-body tabular-nums">
        <thead className="sticky top-0 bg-white text-left">
          <tr className="border-b border-ink-200">
            <th className="py-2 pr-3 font-medium text-ink-500">Date</th>
            {networks.map((n) => (
              <th key={n} className="py-2 pr-3 font-medium text-ink-500">
                {networkLabel(n)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={String(p.date)} className="border-b border-ink-100 last:border-0">
              <td className="py-1.5 pr-3 text-ink-700">{String(p.date)}</td>
              {networks.map((n) => (
                <td key={n} className="py-1.5 pr-3 text-ink-900">
                  {typeof p[n] === "number" ? formatNumber(p[n] as number) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
