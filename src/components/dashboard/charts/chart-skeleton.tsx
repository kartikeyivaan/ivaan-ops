export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-md bg-slate-100"
      style={{ height }}
      aria-hidden
    />
  );
}
