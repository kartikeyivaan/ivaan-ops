"use client";

import { useSession } from "next-auth/react";
import { RequiredPasswordChangeForm } from "@/components/auth/required-password-change-form";

export default function ChangePasswordPage() {
  const { data: session } = useSession();
  const reason = session?.user.passwordChangeReason ?? "FIRST_LOGIN";

  return <RequiredPasswordChangeForm reason={reason} />;
}
