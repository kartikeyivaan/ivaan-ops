import { Card, CardContent } from "@/components/ui/card";

export function ServicePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">Coming soon</p>
          <p className="max-w-md text-sm text-slate-500">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
