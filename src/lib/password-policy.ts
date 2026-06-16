export const PASSWORD_MAX_AGE_DAYS = 30;

export const STRONG_PASSWORD_HINT =
  "Use at least 8 characters with uppercase, lowercase, a number, and a special character.";

export type PasswordChangeReason = "FIRST_LOGIN" | "EXPIRED";

export function isStrongPassword(password: string): boolean {
  return getPasswordStrengthIssues(password).length === 0;
}

export function getPasswordStrengthIssues(password: string): string[] {
  const issues: string[] = [];

  if (password.length < 8) {
    issues.push("At least 8 characters");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("One lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("One uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    issues.push("One number");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push("One special character");
  }

  return issues;
}

export function isPasswordExpired(passwordChangedAt: Date | null, now = new Date()): boolean {
  if (!passwordChangedAt) {
    return true;
  }

  const expiresAt = new Date(passwordChangedAt);
  expiresAt.setDate(expiresAt.getDate() + PASSWORD_MAX_AGE_DAYS);
  return now >= expiresAt;
}

export function getPasswordChangeRequirement(user: {
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
}): { required: boolean; reason: PasswordChangeReason | null } {
  if (user.mustChangePassword) {
    return { required: true, reason: "FIRST_LOGIN" };
  }

  if (isPasswordExpired(user.passwordChangedAt)) {
    return { required: true, reason: "EXPIRED" };
  }

  return { required: false, reason: null };
}

export function getPasswordChangeMessage(reason: PasswordChangeReason | null): string {
  if (reason === "FIRST_LOGIN") {
    return "This is your first sign-in. Set a strong personal password before continuing.";
  }
  if (reason === "EXPIRED") {
    return `Your password is older than ${PASSWORD_MAX_AGE_DAYS} days. Choose a new strong password to continue.`;
  }
  return "Set a strong password to continue.";
}
