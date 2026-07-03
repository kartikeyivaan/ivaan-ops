"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getPasswordChangeMessage,
  getPasswordStrengthIssues,
  STRONG_PASSWORD_HINT,
  type PasswordChangeReason,
} from "@/lib/password-policy";
import { IvaanLogo } from "@/components/layout/ivaan-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RequiredPasswordChangeForm({
  reason,
}: {
  reason: PasswordChangeReason | null;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strengthChecks = useMemo(
    () => [
      { label: "At least 8 characters", met: newPassword.length >= 8 },
      { label: "One lowercase letter", met: /[a-z]/.test(newPassword) },
      { label: "One uppercase letter", met: /[A-Z]/.test(newPassword) },
      { label: "One number", met: /[0-9]/.test(newPassword) },
      { label: "One special character", met: /[^A-Za-z0-9]/.test(newPassword) },
    ],
    [newPassword],
  );

  const remainingIssues = getPasswordStrengthIssues(newPassword);

  async function readResponseBody(response: Response) {
    const text = await response.text();
    if (!text) {
      return { message: "Empty response from server." };
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { message: "Unexpected server response." };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/users/me/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });

    const data = await readResponseBody(response);
    setLoading(false);

    if (!response.ok) {
      const details = data.details as
        | { fieldErrors?: Record<string, string[] | undefined> }
        | undefined;
      const fieldErrors = details?.fieldErrors;
      const firstFieldError =
        fieldErrors?.currentPassword?.[0] ??
        fieldErrors?.newPassword?.[0] ??
        fieldErrors?.confirmPassword?.[0];
      setMessage(
        firstFieldError ??
          (typeof data.message === "string" ? data.message : null) ??
          "Failed to update password.",
      );
      return;
    }

    await update({ passwordUpdated: true });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <IvaanLogo size="md" className="mb-2" />
          <CardTitle>Update your password</CardTitle>
          <CardDescription>{getPasswordChangeMessage(reason)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">Choose a strong password</p>
              <p className="mt-1 text-xs text-slate-600">{STRONG_PASSWORD_HINT}</p>
              <ul className="mt-3 space-y-1">
                {strengthChecks.map((check) => (
                  <li
                    key={check.label}
                    className={`text-sm ${check.met ? "text-emerald-700" : "text-slate-500"}`}
                  >
                    {check.met ? "✓" : "○"} {check.label}
                  </li>
                ))}
              </ul>
              {newPassword && remainingIssues.length === 0 ? (
                <p className="mt-2 text-sm font-medium text-emerald-700">
                  Password strength looks good.
                </p>
              ) : null}
            </div>

            {message ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || remainingIssues.length > 0 || !confirmPassword}
            >
              {loading ? "Saving..." : "Save new password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
