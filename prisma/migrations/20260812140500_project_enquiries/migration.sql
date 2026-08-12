-- CreateEnum
CREATE TYPE "ProjectEnquiryStatus" AS ENUM ('OPEN', 'PROPOSAL_SENT', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "project_enquiries" (
    "id" UUID NOT NULL,
    "enquiry_no" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "sales_user_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_mobile" TEXT NOT NULL,
    "status" "ProjectEnquiryStatus" NOT NULL DEFAULT 'OPEN',
    "next_followup_at" DATE NOT NULL,
    "last_followup_at" DATE,
    "lost_reason" TEXT,
    "proposal_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_enquiry_followups" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "outcome" TEXT,
    "followup_date" DATE NOT NULL,
    "next_followup_at" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_enquiry_followups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_enquiries_enquiry_no_key" ON "project_enquiries"("enquiry_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_enquiries_proposal_id_key" ON "project_enquiries"("proposal_id");

-- CreateIndex
CREATE INDEX "project_enquiries_company_id_status_next_followup_at_idx" ON "project_enquiries"("company_id", "status", "next_followup_at");

-- CreateIndex
CREATE INDEX "project_enquiries_sales_user_id_idx" ON "project_enquiries"("sales_user_id");

-- CreateIndex
CREATE INDEX "project_enquiries_customer_mobile_idx" ON "project_enquiries"("customer_mobile");

-- CreateIndex
CREATE INDEX "project_enquiries_customer_name_idx" ON "project_enquiries"("customer_name");

-- CreateIndex
CREATE INDEX "project_enquiry_followups_enquiry_id_followup_date_idx" ON "project_enquiry_followups"("enquiry_id", "followup_date");

-- AddForeignKey
ALTER TABLE "project_enquiries" ADD CONSTRAINT "project_enquiries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_enquiries" ADD CONSTRAINT "project_enquiries_sales_user_id_fkey" FOREIGN KEY ("sales_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_enquiries" ADD CONSTRAINT "project_enquiries_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "project_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_enquiries" ADD CONSTRAINT "project_enquiries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_enquiries" ADD CONSTRAINT "project_enquiries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_enquiry_followups" ADD CONSTRAINT "project_enquiry_followups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "project_enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_enquiry_followups" ADD CONSTRAINT "project_enquiry_followups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
