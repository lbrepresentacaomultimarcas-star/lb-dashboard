"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brl, monthLabel } from "@/lib/utils";

export function SalesChart({ data }: { data: { mes: string; total: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradBrand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={(k) => monthLabel(k).slice(0, 3)}
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#12121a",
              border: "1px solid #2a2a3a",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e8e8f0" }}
            labelFormatter={(k) => monthLabel(String(k))}
            formatter={(v) => [brl(Number(v)), "Faturamento"]}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#gradBrand)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
