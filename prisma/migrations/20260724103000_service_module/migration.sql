-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CLOSED', 'CANCELLED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ServicePriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ServiceWaitingReason" AS ENUM ('MATERIAL_REQUIRED', 'CUSTOMER_RESPONSE', 'CUSTOMER_AVAILABILITY', 'PAYMENT', 'EXTERNAL_AGENCY', 'INTERNAL_APPROVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceSystemStatus" AS ENUM ('WORKING', 'PARTIALLY_WORKING', 'NOT_WORKING', 'NOT_CHECKED');

-- CreateEnum
CREATE TYPE "ServiceCompletionSystemStatus" AS ENUM ('WORKING', 'PARTIALLY_WORKING', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ServiceComplaintSource" AS ENUM ('PHONE', 'WHATSAPP', 'OFFICE_VISIT', 'SITE_VISIT', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceCustomerConfirmation" AS ENUM ('CONFIRMED_VERBALLY', 'CONFIRMED_WHATSAPP', 'SIGNATURE_PHOTO', 'NOT_AVAILABLE', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ServiceUpdateType" AS ENUM ('CREATED', 'EDITED', 'ASSIGNMENT', 'STATUS_CHANGE', 'CUSTOMER_CONTACTED', 'VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'WORK_UPDATE', 'MATERIAL_REQUIRED', 'PAYMENT_FOLLOWUP', 'PAYMENT_RECORDED', 'COMPLETION', 'GENERAL_NOTE');

-- CreateEnum
CREATE TYPE "ServiceContactMode" AS ENUM ('CALL', 'WHATSAPP', 'OFFICE_VISIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceVisitStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CUSTOMER_UNAVAILABLE', 'CANCELLED', 'FOLLOWUP_REQUIRED');

-- CreateEnum
CREATE TYPE "ServicePaymentMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "service_work_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_target_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_work_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "service_request_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "mobile_number" TEXT,
    "alternate_mobile_number" TEXT,
    "consumer_number" TEXT,
    "installation_address" TEXT,
    "city_or_village" TEXT,
    "landmark" TEXT,
    "work_type_id" UUID,
    "custom_work_type" TEXT,
    "customer_request" TEXT NOT NULL,
    "priority" "ServicePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ServiceStatus" NOT NULL DEFAULT 'OPEN',
    "waiting_reason" "ServiceWaitingReason",
    "assigned_to_user_id" UUID,
    "request_date" TIMESTAMP(3) NOT NULL,
    "target_completion_date" DATE,
    "next_action_date" DATE,
    "system_status" "ServiceSystemStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "complaint_source" "ServiceComplaintSource",
    "is_chargeable" BOOLEAN NOT NULL DEFAULT false,
    "total_fees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_received" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pending_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "completion_date" DATE,
    "completion_notes" TEXT,
    "system_status_after_work" "ServiceCompletionSystemStatus",
    "customer_confirmation" "ServiceCustomerConfirmation",
    "further_work_required" BOOLEAN NOT NULL DEFAULT false,
    "closed_date" DATE,
    "cancellation_reason" TEXT,
    "reopened_reason" TEXT,
    "internal_note" TEXT,
    "import_reference" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_updates" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "update_type" "ServiceUpdateType" NOT NULL,
    "note" TEXT,
    "old_status" "ServiceStatus",
    "new_status" "ServiceStatus",
    "waiting_reason" "ServiceWaitingReason",
    "next_action_date" DATE,
    "visit_date" DATE,
    "visit_time" TEXT,
    "visit_status" "ServiceVisitStatus",
    "visit_result" TEXT,
    "contact_mode" "ServiceContactMode",
    "material_details" TEXT,
    "further_work_required" BOOLEAN,
    "assigned_executive_id" UUID,
    "old_assigned_to_user_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_attachments" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "service_update_id" UUID,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT,
    "attachment_type" TEXT,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_payments" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_mode" "ServicePaymentMode" NOT NULL,
    "payment_date" DATE NOT NULL,
    "reference" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_work_types_name_key" ON "service_work_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_service_request_number_key" ON "service_requests"("service_request_number");

-- CreateIndex
CREATE INDEX "service_requests_company_id_status_idx" ON "service_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_mobile_number_idx" ON "service_requests"("mobile_number");

-- CreateIndex
CREATE INDEX "service_requests_consumer_number_idx" ON "service_requests"("consumer_number");

-- CreateIndex
CREATE INDEX "service_requests_assigned_to_user_id_idx" ON "service_requests"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "service_requests_request_date_idx" ON "service_requests"("request_date");

-- CreateIndex
CREATE INDEX "service_requests_target_completion_date_idx" ON "service_requests"("target_completion_date");

-- CreateIndex
CREATE INDEX "service_updates_service_request_id_created_at_idx" ON "service_updates"("service_request_id", "created_at");

-- CreateIndex
CREATE INDEX "service_attachments_service_request_id_idx" ON "service_attachments"("service_request_id");

-- CreateIndex
CREATE INDEX "service_attachments_service_update_id_idx" ON "service_attachments"("service_update_id");

-- CreateIndex
CREATE INDEX "service_payments_service_request_id_idx" ON "service_payments"("service_request_id");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_work_type_id_fkey" FOREIGN KEY ("work_type_id") REFERENCES "service_work_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_updates" ADD CONSTRAINT "service_updates_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_updates" ADD CONSTRAINT "service_updates_assigned_executive_id_fkey" FOREIGN KEY ("assigned_executive_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_updates" ADD CONSTRAINT "service_updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachments_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachments_service_update_id_fkey" FOREIGN KEY ("service_update_id") REFERENCES "service_updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ensure the Service Executive role exists for user assignment.
INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Service Executive', 'Service Executive role', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Seed initial service work types (PRD §10).
INSERT INTO "service_work_types" ("id", "name", "default_target_days", "is_active", "display_order", "updated_at")
VALUES
  (gen_random_uuid(), 'Pending Civil Work', NULL, true, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cement Block Work', NULL, true, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Structure Work', NULL, true, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Electrical Work', NULL, true, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Inverter Settings', NULL, true, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Monitoring Setup', NULL, true, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'System Not Working', NULL, true, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Low Generation', NULL, true, 8, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Inverter Issue', NULL, true, 9, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Panel Issue', NULL, true, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Meter Issue', NULL, true, 11, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Leakage Issue', NULL, true, 12, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Panel Cleaning', NULL, true, 13, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'System Inspection', NULL, true, 14, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'System Expansion', NULL, true, 15, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Additional Panels', NULL, true, 16, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Documentation Support', NULL, true, 17, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'General Complaint', NULL, true, 18, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Other', NULL, true, 19, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
