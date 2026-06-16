import { CredentialsSignin } from "@auth/core/errors";
import { formatLoginErrorCode } from "@/lib/account-lockout";

export class AccountLockedError extends CredentialsSignin {
  code = formatLoginErrorCode("ACCOUNT_LOCKED");
}

export class AccountTemporarilyLockedError extends CredentialsSignin {
  code: string;

  constructor(minutesRemaining: number) {
    super();
    this.code = formatLoginErrorCode("TIME_LOCKED", minutesRemaining);
  }
}

export class InvalidLoginError extends CredentialsSignin {
  code: string;

  constructor(attemptsRemaining?: number, privileged = false) {
    super();
    this.code = privileged
      ? formatLoginErrorCode("ADMIN_INVALID_CREDENTIALS", attemptsRemaining)
      : formatLoginErrorCode("INVALID_CREDENTIALS", attemptsRemaining);
  }
}
