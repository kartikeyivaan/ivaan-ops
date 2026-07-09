import Image from "next/image";
import {
  INSTALLATION_TIMELINE_ICON_SIZE_PX,
  INSTALLATION_TIMELINE_ICON_SRC,
  type InstallationTimelineIcon,
} from "@/lib/installation-timeline";
import { cn } from "@/lib/utils";

export function InstallationTimelineStepIcon({
  icon,
  className,
  size = INSTALLATION_TIMELINE_ICON_SIZE_PX,
}: {
  icon: InstallationTimelineIcon;
  className?: string;
  size?: number;
}) {
  const src = INSTALLATION_TIMELINE_ICON_SRC[icon];

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      aria-hidden
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
