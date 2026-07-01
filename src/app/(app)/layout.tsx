import AppShell from "@/components/layout/app-shell";
import { PasswordChangeGate } from "@/components/auth/password-change-gate";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PasswordChangeGate>
      <AppShell>{children}</AppShell>
    </PasswordChangeGate>
  );
}
