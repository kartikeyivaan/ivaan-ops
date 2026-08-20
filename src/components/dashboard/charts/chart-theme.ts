export const CHART_COLORS = {
  emerald: "#059669",
  emeraldLight: "#10b981",
  emeraldMuted: "#6ee7b7",
  amber: "#d97706",
  slate: "#64748b",
  funnel: ["#059669", "#10b981", "#34d399", "#6ee7b7"],
  composition: ["#059669", "#0ea5e9", "#a855f7"],
  aging: ["#fcd34d", "#fbbf24", "#f59e0b", "#d97706"],
} as const;

export const CHART_AXIS = {
  tick: { fill: "#64748b", fontSize: 12 },
  stroke: "#e2e8f0",
} as const;

export function formatChartDateLabel(value: string): string {
  const day = value.slice(8, 10);
  const month = value.slice(5, 7);
  return `${day}/${month}`;
}
