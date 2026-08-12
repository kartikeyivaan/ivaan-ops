import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function IncomingSerialExportButton({
  lotId,
  serialTracking,
  receivedQuantity,
  canExport,
}: {
  lotId: string;
  serialTracking: boolean;
  receivedQuantity: number;
  canExport: boolean;
}) {
  if (!serialTracking || !canExport) {
    return null;
  }

  const canDownload = receivedQuantity > 0;
  if (!canDownload) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      asChild
      title="Download recorded serial numbers"
    >
      <a href={`/api/inventory/incoming/${lotId}/serials/export`} download>
        <Download className="mr-2 h-4 w-4" />
        Serials
      </a>
    </Button>
  );
}
