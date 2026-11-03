-- Simple Project Dispatch: optional proposal link, optional material line, pending-approval status

ALTER TYPE "ProjectDispatchStatus" ADD VALUE 'PENDING_APPROVAL';

ALTER TABLE "projects"
  ALTER COLUMN "proposal_id" DROP NOT NULL,
  ALTER COLUMN "revision_id" DROP NOT NULL,
  ALTER COLUMN "customer_mobile" SET DEFAULT '',
  ALTER COLUMN "site_address" SET DEFAULT '';

ALTER TABLE "project_dispatch_lines"
  ALTER COLUMN "material_line_id" DROP NOT NULL;
