"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import type { CalibrationBin } from "@/modules/calibration";
import { useReducedMotion } from "@/components/use-reduced-motion";

export interface CalibrationChartProps {
  ours: CalibrationBin[];
  market: CalibrationBin[];
}

/** Predicted probability (binned) vs realized frequency, ours and the market's on the same axes (docs/01 §3.3). */
export function CalibrationChart({ ours, market }: CalibrationChartProps) {
  const reduced = useReducedMotion();
  const data = ours.map((b, i) => ({
    mid: (b.binLow + b.binHigh) / 2,
    ours: b.n > 0 ? b.realizedFrequency : null,
    market: market[i]!.n > 0 ? market[i]!.realizedFrequency : null,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <CartesianGrid stroke="#262D37" vertical={false} />
          <XAxis
            dataKey="mid"
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            stroke="#8A93A2"
            fontSize={11}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            stroke="#8A93A2"
            fontSize={11}
            width={40}
          />
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
            stroke="#262D37"
            strokeDasharray="4 4"
          />
          <Tooltip
            contentStyle={{ background: "#161B22", border: "1px solid #262D37", fontSize: 12, color: "#E6E9EE" }}
            formatter={(v, name) => [
              typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—",
              name === "ours" ? "Our model" : "Market",
            ]}
            labelFormatter={(v: number) => `predicted ~${(v * 100).toFixed(0)}%`}
          />
          <Line type="monotone" dataKey="ours" stroke="#7AA2F7" dot connectNulls strokeWidth={1.5} isAnimationActive={!reduced} />
          <Line type="monotone" dataKey="market" stroke="#8A93A2" dot connectNulls strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={!reduced} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
