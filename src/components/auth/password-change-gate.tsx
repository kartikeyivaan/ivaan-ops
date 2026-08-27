"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (pathname === "/change-password") return;
    if (session?.user.passwordChangeRequired) {
      router.replace("/change-password");
    }
  }, [status, session?.user.passwordChangeRequired, pathname, router]);

  return children;
}
