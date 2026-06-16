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

    async function checkPasswordStatus() {
      if (session?.user.passwordChangeRequired) {
        router.replace("/change-password");
        return;
      }

      const response = await fetch("/api/users/me/password-status");
      if (!response.ok) return;

      const data = (await response.json()) as { required?: boolean };
      if (data.required) {
        router.replace("/change-password");
      }
    }

    void checkPasswordStatus();
  }, [status, session?.user.passwordChangeRequired, pathname, router]);

  return children;
}
