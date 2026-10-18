-- CreateEnum
CREATE TYPE "AutomationWorkflow" AS ENUM ('SHARE_DCR_TO_CUSTOMERS');

-- CreateEnum
CREATE TYPE "AutomationQueueItemStatus" AS ENUM ('READY', 'PROCESSING', 'DCR_ISSUED', 'FAILED', 'REQUIRES_ATTENTION', 'SKIPPED', 'ALREADY_ISSUED', 'REQUIRES_MANUAL');

-- CreateEnum
CREATE TYPE "DcrPortalTarget" AS ENUM ('PCMV', 'ISE');

-- CreateEnum
CREATE TYPE "DcrPortalStrategy" AS ENUM ('PCMV_THEN_ISE', 'ISE_THEN_PCMV', 'PCMV_ONLY', 'ISE_ONLY');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_LOGIN', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AutomationPortalAttemptStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AutomationExecutionEventType" AS ENUM ('INFO', 'STEP', 'ERROR', 'PORTAL_SWITCH', 'LOGIN_REQUIRED');

-- CreateTable
CREATE TABLE "automation_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT,
    "secret_hash" TEXT NOT NULL,
    "agent_version" TEXT,
    "status" "AutomationDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_device_pairing_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "device_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_device_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" UUID NOT NULL,
    "workflow" "AutomationWorkflow" NOT NULL DEFAULT 'SHARE_DCR_TO_CUSTOMERS',
    "portal_strategy" "DcrPortalStrategy" NOT NULL,
    "include_early_dcr" BOOLEAN NOT NULL DEFAULT false,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "initiated_by" UUID NOT NULL,
    "device_id" UUID,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "progress_done" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "cancel_reason" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_companies" (
    "execution_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,

    CONSTRAINT "automation_execution_companies_pkey" PRIMARY KEY ("execution_id","company_id")
);

-- CreateTable
CREATE TABLE "automation_queue_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "dispatch_line_id" UUID NOT NULL,
    "documentation_record_id" UUID NOT NULL,
    "workflow" "AutomationWorkflow" NOT NULL DEFAULT 'SHARE_DCR_TO_CUSTOMERS',
    "status" "AutomationQueueItemStatus" NOT NULL DEFAULT 'READY',
    "external_dcr_number" TEXT,
    "external_dcr_issued_at" TIMESTAMP(3),
    "external_portal_status" TEXT,
    "last_portal" "DcrPortalTarget",
    "requires_manual" BOOLEAN NOT NULL DEFAULT false,
    "last_execution_id" UUID,
    "last_error" TEXT,
    "last_attempt_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_portal_attempts" (
    "id" UUID NOT NULL,
    "queue_item_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "portal" "DcrPortalTarget" NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "status" "AutomationPortalAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "external_dcr_number" TEXT,
    "error_message" TEXT,
    "workflow_step" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_portal_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_events" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "portal_attempt_id" UUID,
    "event_type" "AutomationExecutionEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_screenshots" (
    "id" UUID NOT NULL,
    "portal_attempt_id" UUID NOT NULL,
    "storage_url" TEXT NOT NULL,
    "file_name" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_device_pairing_codes_device_id_key" ON "automation_device_pairing_codes"("device_id");

-- CreateIndex
CREATE INDEX "automation_device_pairing_codes_user_id_expires_at_idx" ON "automation_device_pairing_codes"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "automation_devices_user_id_status_idx" ON "automation_devices"("user_id", "status");

-- CreateIndex
CREATE INDEX "automation_executions_status_created_at_idx" ON "automation_executions"("status", "created_at");

-- CreateIndex
CREATE INDEX "automation_executions_initiated_by_created_at_idx" ON "automation_executions"("initiated_by", "created_at");

-- CreateIndex
CREATE INDEX "automation_executions_device_id_idx" ON "automation_executions"("device_id");

-- CreateIndex
CREATE INDEX "automation_execution_companies_company_id_idx" ON "automation_execution_companies"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_queue_items_dispatch_line_id_key" ON "automation_queue_items"("dispatch_line_id");

-- CreateIndex
CREATE INDEX "automation_queue_items_company_id_status_idx" ON "automation_queue_items"("company_id", "status");

-- CreateIndex
CREATE INDEX "automation_queue_items_dispatch_id_idx" ON "automation_queue_items"("dispatch_id");

-- CreateIndex
CREATE INDEX "automation_queue_items_documentation_record_id_idx" ON "automation_queue_items"("documentation_record_id");

-- CreateIndex
CREATE INDEX "automation_queue_items_last_execution_id_idx" ON "automation_queue_items"("last_execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_portal_attempts_queue_item_id_execution_id_portal_key" ON "automation_portal_attempts"("queue_item_id", "execution_id", "portal", "sequence_no");

-- CreateIndex
CREATE INDEX "automation_portal_attempts_execution_id_status_idx" ON "automation_portal_attempts"("execution_id", "status");

-- CreateIndex
CREATE INDEX "automation_execution_events_execution_id_created_at_idx" ON "automation_execution_events"("execution_id", "created_at");

-- CreateIndex
CREATE INDEX "automation_execution_events_portal_attempt_id_idx" ON "automation_execution_events"("portal_attempt_id");

-- CreateIndex
CREATE INDEX "automation_screenshots_portal_attempt_id_captured_at_idx" ON "automation_screenshots"("portal_attempt_id", "captured_at");

-- AddForeignKey
ALTER TABLE "automation_devices" ADD CONSTRAINT "automation_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_devices" ADD CONSTRAINT "automation_devices_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_device_pairing_codes" ADD CONSTRAINT "automation_device_pairing_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_device_pairing_codes" ADD CONSTRAINT "automation_device_pairing_codes_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "automation_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "automation_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_companies" ADD CONSTRAINT "automation_execution_companies_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_companies" ADD CONSTRAINT "automation_execution_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_queue_items" ADD CONSTRAINT "automation_queue_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_queue_items" ADD CONSTRAINT "automation_queue_items_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_queue_items" ADD CONSTRAINT "automation_queue_items_dispatch_line_id_fkey" FOREIGN KEY ("dispatch_line_id") REFERENCES "dispatch_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_queue_items" ADD CONSTRAINT "automation_queue_items_documentation_record_id_fkey" FOREIGN KEY ("documentation_record_id") REFERENCES "documentation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_queue_items" ADD CONSTRAINT "automation_queue_items_last_execution_id_fkey" FOREIGN KEY ("last_execution_id") REFERENCES "automation_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_portal_attempts" ADD CONSTRAINT "automation_portal_attempts_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "automation_queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_portal_attempts" ADD CONSTRAINT "automation_portal_attempts_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_events" ADD CONSTRAINT "automation_execution_events_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_events" ADD CONSTRAINT "automation_execution_events_portal_attempt_id_fkey" FOREIGN KEY ("portal_attempt_id") REFERENCES "automation_portal_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_screenshots" ADD CONSTRAINT "automation_screenshots_portal_attempt_id_fkey" FOREIGN KEY ("portal_attempt_id") REFERENCES "automation_portal_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
