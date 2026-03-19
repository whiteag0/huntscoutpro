"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { YearData } from "@/data/types";

interface HarvestChartProps {
  years: YearData[];
  title?: string;
}

export function HarvestChart({ years, title }: HarvestChartProps) {
  const data = years.map((y) => ({
    year: y.year,
    harvest: y.totalHarvest,
    hunters: y.huntersAfield,
    successRate: y.successRate,
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-bold text-foreground mb-4">{title || "Harvest Statistics"}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d4ccc4" />
          <XAxis dataKey="year" stroke="#6b6560" />
          <YAxis stroke="#6b6560" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #d4ccc4",
              borderRadius: "8px",
            }}
          />
          <Legend />
          <Bar dataKey="hunters" name="Hunters Afield" fill="#4a7c59" radius={[4, 4, 0, 0]} />
          <Bar dataKey="harvest" name="Total Harvest" fill="#c4651a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SuccessRateChart({ years, title }: HarvestChartProps) {
  const data = years.map((y) => ({
    year: y.year,
    successRate: y.successRate,
    tags: y.totalTags,
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-bold text-foreground mb-4">{title || "Success Rate Trend"}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d4ccc4" />
          <XAxis dataKey="year" stroke="#6b6560" />
          <YAxis stroke="#6b6560" domain={[0, 100]} unit="%" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #d4ccc4",
              borderRadius: "8px",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="successRate"
            name="Success Rate"
            stroke="#2d5016"
            strokeWidth={3}
            dot={{ r: 5, fill: "#2d5016" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
