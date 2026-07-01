"use client";

import { useMemo, useState } from "react";
import { getPasswordStrengthIssues, STRONG_PASSWORD_HINT } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordDialog({
  userId,
  userName,
  isLocked = false,
  onClose,
}: {
  userId: string;
  userName: string;
  isLocked?: boolean;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const remainingIssues = getPasswordStrengthIssues(password);

  const strengthChecks = useMemo(
    () => [
      { label: "At least 8 characters", met: password.length >= 8 },
      { label: "One lowercase letter", met: /[a-z]/.test(password) },
      { label: "One uppercase letter", met: /[A-Z]/.test(password) },
      { label: "One number", met: /[0-9]/.test(password) },
      { label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
    ],
    [password],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch(`/api/users/${userId}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmPassword }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      const fieldErrors = data.details?.fieldErrors as
        | Record<string, string[] | undefined>
        | undefined;
      const confirmError = fieldErrors?.confirmPassword?.[0];
      setMessage(confirmError ?? data.message ?? "Failed to change password.");
      return;
    }

    onClose();
  }

  return (
    <Modal onClose={onClose} size="sm">
      <ModalHeader title="Change Password" onClose={onClose} />
      <ModalForm onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          <p className="text-sm text-slate-600">
            {isLocked ? (
              <>
                <span className="font-medium">{userName}</span> is locked after failed
                sign-in attempts. Set a new temporary password to unlock the account.
              </>
            ) : (
              <>
                Set a temporary password for <span className="font-medium">{userName}</span>.
                They will be asked to choose a new strong password on next sign-in.
              </>
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-900">Strong password rules</p>
            <p className="mt-1 text-xs text-slate-600">{STRONG_PASSWORD_HINT}</p>
            <ul className="mt-2 space-y-1">
              {strengthChecks.map((check) => (
                <li
                  key={check.label}
                  className={`text-sm ${check.met ? "text-emerald-700" : "text-slate-500"}`}
                >
                  {check.met ? "✓" : "○"} {check.label}
                </li>
              ))}
            </ul>
          </div>
          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="submit" disabled={loading || remainingIssues.length > 0}>
            {loading ? "Saving..." : "Update password"}
          </Button>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}
