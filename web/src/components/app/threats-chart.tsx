"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// Colors validated with the dataviz palette checker against the dark card surface.
const config = {
  scans: { label: "Scans", color: "var(--chart-1)" },
  threats: { label: "Threats", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function ThreatsChart({ data }: { data: { label: string; scans: number; threats: number }[] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }} accessibilityLayer>
        <defs>
          <linearGradient id="fill-scans" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-scans)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-scans)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fill-threats" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-threats)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-threats)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.08} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip cursor={{ strokeOpacity: 0.2 }} content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="scans" type="monotone" stroke="var(--color-scans)" fill="url(#fill-scans)" strokeWidth={2} activeDot={{ r: 4 }} />
        <Area dataKey="threats" type="monotone" stroke="var(--color-threats)" fill="url(#fill-threats)" strokeWidth={2} activeDot={{ r: 4 }} />
      </AreaChart>
    </ChartContainer>
  );
}
