"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useReducedMotion } from "@/components/use-reduced-motion";

export interface PricePoint {
  t: number; // epoch ms
  mid: number | null; // [0,1]
}

/** YES mid price over time from our snapshots (docs/01 §3.2 step 4). */
export function PriceChart({ data }: { data: PricePoint[] }) {
  const reduced = useReducedMotion();

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        No price history yet — snapshots accrue every 30 minutes.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <CartesianGrid stroke="#262D37" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleDateString()}
            stroke="#8A93A2"
            fontSize={11}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}¢`}
            stroke="#8A93A2"
            fontSize={11}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "#161B22",
              border: "1px solid #262D37",
              fontSize: 12,
              color: "#E6E9EE",
            }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
            formatter={(v) => [typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—", "YES mid"]}
          />
          <Line
            type="monotone"
            dataKey="mid"
            stroke="#7AA2F7"
            dot={false}
            strokeWidth={1.5}
            connectNulls
            isAnimationActive={!reduced}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
