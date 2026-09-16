-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('ASSIGNED', 'SELF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING_ACKNOWLEDGEMENT', 'ACKNOWLEDGED', 'TO_DO', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskLinkedRecordType" AS ENUM ('CUSTOMER', 'PROJECT_ENQUIRY', 'QUOTATION', 'PI', 'PAYMENT', 'INVOICE', 'PROJECT', 'SERVICE_COMPLAINT', 'PURCHASE_REQUEST', 'INVENTORY_LOT', 'INVENTORY_AUDIT', 'BANK_TRANSACTION');

-- CreateEnum
CREATE TYPE "TaskActivityType" AS ENUM ('CREATED', 'ASSIGNED', 'ACKNOWLEDGED', 'REJECTED', 'STATUS_CHANGED', 'REASSIGNED', 'REASSIGNMENT_REQUESTED', 'REASSIGNMENT_DECIDED', 'COMMENT_ADDED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskReassignmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "href" TEXT;

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "task_type" "TaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID,
    "assigned_to" UUID NOT NULL,
    "due_date" DATE,
    "due_time" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL,
    "linked_record_type" "TaskLinkedRecordType",
    "linked_record_id" UUID,
    "system_trigger_key" TEXT,
    "system_trigger_reason" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,
    "completion_note" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "cancellation_reason" TEXT,
    "due_reminder_on" DATE,
    "overdue_reminder_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_activity" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "activity_type" "TaskActivityType" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reassignment_requests" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_to" UUID,
    "reason" TEXT NOT NULL,
    "status" "TaskReassignmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reassignment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_assigned_to_idx" ON "tasks"("assigned_to");

-- CreateIndex
CREATE INDEX "tasks_created_by_idx" ON "tasks"("created_by");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_task_type_idx" ON "tasks"("task_type");

-- CreateIndex
CREATE INDEX "tasks_company_id_idx" ON "tasks"("company_id");

-- CreateIndex
CREATE INDEX "tasks_linked_record_type_linked_record_id_idx" ON "tasks"("linked_record_type", "linked_record_id");

-- CreateIndex
CREATE INDEX "tasks_system_trigger_key_linked_record_type_linked_record_id_idx" ON "tasks"("system_trigger_key", "linked_record_type", "linked_record_id");

-- CreateIndex
CREATE INDEX "tasks_assigned_to_status_due_date_idx" ON "tasks"("assigned_to", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_system_active_dedup_idx" ON "tasks"("system_trigger_key", "linked_record_type", "linked_record_id")
WHERE "task_type" = 'SYSTEM'
  AND "system_trigger_key" IS NOT NULL
  AND "linked_record_type" IS NOT NULL
  AND "linked_record_id" IS NOT NULL
  AND "status" NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateIndex
CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_activity_task_id_created_at_idx" ON "task_activity"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_reassignment_requests_task_id_status_idx" ON "task_reassignment_requests"("task_id", "status");

-- CreateIndex
CREATE INDEX "task_reassignment_requests_requested_by_idx" ON "task_reassignment_requests"("requested_by");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reassignment_requests" ADD CONSTRAINT "task_reassignment_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reassignment_requests" ADD CONSTRAINT "task_reassignment_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reassignment_requests" ADD CONSTRAINT "task_reassignment_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
