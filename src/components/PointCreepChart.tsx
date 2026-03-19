"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { HuntUnit, Residency } from "@/data/types";

interface PointCreepChartProps {
  units: HuntUnit[];
  residency: Residency;
  userPoints?: number;
}

export function PointCreepChart({ units, residency, userPoints }: PointCreepChartProps) {
  if (units.length === 0) return null;

  // Show min points trend over years for each unit
  const allYears = units[0].years.map((y) => y.year);

  const data = allYears.map((year) => {
    const row: Record<string, number> = { year };
    for (const u of units) {
      const yd = u.years.find((y) => y.year === year);
      if (yd) {
        const key = `${u.gmu} ${u.season} ${u.sex}`;
        row[key] = residency === "resident" ? yd.minPointsResident : yd.minPointsNonresident;
      }
    }
    return row;
  });

  const colors = [
    "#2d5016", "#c4651a", "#2d7a3a", "#8b4513", "#4a7c59",
    "#b8860b", "#6b4423", "#556b2f", "#a0522d", "#3c6e47",
  ];

  const lineKeys = units.map((u) => `${u.gmu} ${u.season} ${u.sex}`);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-bold text-foreground mb-4">
        Point Creep Trend ({residency === "resident" ? "Resident" : "Non-Resident"})
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d4ccc4" />
          <XAxis dataKey="year" stroke="#6b6560" />
          <YAxis stroke="#6b6560" label={{ value: "Min Points", angle: -90, position: "insideLeft" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #d4ccc4",
              borderRadius: "8px",
            }}
          />
          <Legend />
          {userPoints !== undefined && (
            <ReferenceLine
              y={userPoints}
              stroke="#c4651a"
              strokeDasharray="5 5"
              label={{ value: `Your Points (${userPoints})`, fill: "#c4651a", fontSize: 12 }}
            />
          )}
          {lineKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              name={key}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
