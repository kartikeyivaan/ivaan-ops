-- Account lockout after repeated failed login attempts

ALTER TYPE "UserStatus" ADD VALUE 'LOCKED';

ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
