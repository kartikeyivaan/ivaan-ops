import Link from "next/link";
import { FileText, IndianRupee, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActionsBar() {
  const actions = [
    { label: "New Quotation", href: "/sales/quotations/new", icon: Plus },
    { label: "New PI", href: "/sales/proforma-invoices/new", icon: FileText },
    { label: "Record Payment", href: "/sales/proforma-invoices", icon: IndianRupee },
    { label: "Open Customer", href: "/sales/customers", icon: UserRound },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.label} variant="outline" size="sm" asChild>
          <Link href={action.href}>
            <action.icon className="h-4 w-4" />
            {action.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
