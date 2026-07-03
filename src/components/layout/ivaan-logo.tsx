import Image from "next/image";
import { cn } from "@/lib/utils";

const sizes = {
  sm: { box: "h-10 w-10", px: 40 },
  md: { box: "h-12 w-12", px: 48 },
} as const;

export function IvaanLogo({
  size = "sm",
  className,
}: {
  size?: keyof typeof sizes;
  className?: string;
}) {
  const { box, px } = sizes[size];

  return (
    <div className={cn("relative shrink-0", box, className)}>
      <Image
        src="/branding/ivaan-logo.png"
        alt="IvaanOps"
        width={px}
        height={px}
        className="h-full w-full object-contain"
        priority
      />
    </div>
  );
}
