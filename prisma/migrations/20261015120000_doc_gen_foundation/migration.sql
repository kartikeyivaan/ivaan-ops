-- MSEB Document Generator foundation (ISE-scoped at application layer)

-- AlterEnum
ALTER TYPE "PdfDocumentType" ADD VALUE 'DOC_GEN_TEMPLATE_BACKGROUND';
ALTER TYPE "PdfDocumentType" ADD VALUE 'DOC_GEN_OUTPUT';
ALTER TYPE "PdfDocumentType" ADD VALUE 'DOC_GEN_COMBINED';

-- CreateEnum
CREATE TYPE "DocGenFieldInputType" AS ENUM ('TEXT', 'NUMBER', 'DROPDOWN', 'RADIO', 'MULTI_SELECT', 'DATE', 'TEXTAREA');
CREATE TYPE "DocGenEntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "DocGenVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "DocGenTemplateEditorType" AS ENUM ('RICH_TEXT', 'CANVAS', 'PDF_BACKGROUND');
CREATE TYPE "DocGenLayoutMode" AS ENUM ('FIXED_PAGE', 'FLOWING');
CREATE TYPE "DocGenGenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "doc_gen_fields" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "input_type" "DocGenFieldInputType" NOT NULL,
    "configuration_json" JSONB NOT NULL DEFAULT '{}',
    "is_required_default" BOOLEAN NOT NULL DEFAULT false,
    "default_value" TEXT,
    "help_text" TEXT,
    "placeholder" TEXT,
    "status" "DocGenEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_gen_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_templates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "editor_type" "DocGenTemplateEditorType" NOT NULL,
    "layout_mode" "DocGenLayoutMode" NOT NULL,
    "status" "DocGenEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_published_version_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_gen_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "template_content_json" JSONB NOT NULL,
    "page_configuration_json" JSONB NOT NULL DEFAULT '{}',
    "background_stored_pdf_id" UUID,
    "status" "DocGenVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "doc_gen_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_document_sets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "DocGenEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_published_version_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_gen_document_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_document_set_versions" (
    "id" UUID NOT NULL,
    "document_set_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "field_config_json" JSONB NOT NULL DEFAULT '{}',
    "status" "DocGenVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "published_by" UUID,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "doc_gen_document_set_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_document_set_version_items" (
    "id" UUID NOT NULL,
    "set_version_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "doc_gen_document_set_version_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_profiles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "mobile_number" TEXT,
    "consumer_number" TEXT,
    "field_values_json" JSONB NOT NULL DEFAULT '{}',
    "linked_customer_id" UUID,
    "linked_service_request_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_gen_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_generations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "document_set_id" UUID NOT NULL,
    "document_set_version_id" UUID NOT NULL,
    "profile_id" UUID,
    "customer_snapshot_json" JSONB NOT NULL,
    "status" "DocGenGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "combined_stored_pdf_id" UUID,
    "error_message" TEXT,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_gen_generations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doc_gen_generated_documents" (
    "id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "document_name" TEXT NOT NULL,
    "stored_pdf_id" UUID,
    "page_count" INTEGER,
    "status" "DocGenGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_gen_generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doc_gen_fields_company_id_field_key_key" ON "doc_gen_fields"("company_id", "field_key");
CREATE INDEX "doc_gen_fields_company_id_status_idx" ON "doc_gen_fields"("company_id", "status");

CREATE UNIQUE INDEX "doc_gen_templates_current_published_version_id_key" ON "doc_gen_templates"("current_published_version_id");
CREATE INDEX "doc_gen_templates_company_id_status_idx" ON "doc_gen_templates"("company_id", "status");

CREATE UNIQUE INDEX "doc_gen_template_versions_template_id_version_number_key" ON "doc_gen_template_versions"("template_id", "version_number");
CREATE INDEX "doc_gen_template_versions_template_id_status_idx" ON "doc_gen_template_versions"("template_id", "status");

CREATE UNIQUE INDEX "doc_gen_document_sets_current_published_version_id_key" ON "doc_gen_document_sets"("current_published_version_id");
CREATE INDEX "doc_gen_document_sets_company_id_status_idx" ON "doc_gen_document_sets"("company_id", "status");

CREATE UNIQUE INDEX "doc_gen_document_set_versions_document_set_id_version_number_key" ON "doc_gen_document_set_versions"("document_set_id", "version_number");
CREATE INDEX "doc_gen_document_set_versions_document_set_id_status_idx" ON "doc_gen_document_set_versions"("document_set_id", "status");

CREATE UNIQUE INDEX "doc_gen_document_set_version_items_set_version_id_sort_order_key" ON "doc_gen_document_set_version_items"("set_version_id", "sort_order");
CREATE INDEX "doc_gen_document_set_version_items_template_version_id_idx" ON "doc_gen_document_set_version_items"("template_version_id");

CREATE INDEX "doc_gen_profiles_company_id_display_name_idx" ON "doc_gen_profiles"("company_id", "display_name");
CREATE INDEX "doc_gen_profiles_company_id_mobile_number_idx" ON "doc_gen_profiles"("company_id", "mobile_number");
CREATE INDEX "doc_gen_profiles_company_id_consumer_number_idx" ON "doc_gen_profiles"("company_id", "consumer_number");

CREATE INDEX "doc_gen_generations_company_id_generated_at_idx" ON "doc_gen_generations"("company_id", "generated_at");
CREATE INDEX "doc_gen_generations_profile_id_idx" ON "doc_gen_generations"("profile_id");

CREATE INDEX "doc_gen_generated_documents_generation_id_idx" ON "doc_gen_generated_documents"("generation_id");

-- AddForeignKey
ALTER TABLE "doc_gen_fields" ADD CONSTRAINT "doc_gen_fields_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_fields" ADD CONSTRAINT "doc_gen_fields_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_fields" ADD CONSTRAINT "doc_gen_fields_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doc_gen_templates" ADD CONSTRAINT "doc_gen_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_templates" ADD CONSTRAINT "doc_gen_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_templates" ADD CONSTRAINT "doc_gen_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doc_gen_templates" ADD CONSTRAINT "doc_gen_templates_current_published_version_id_fkey" FOREIGN KEY ("current_published_version_id") REFERENCES "doc_gen_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doc_gen_template_versions" ADD CONSTRAINT "doc_gen_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "doc_gen_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doc_gen_template_versions" ADD CONSTRAINT "doc_gen_template_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_template_versions" ADD CONSTRAINT "doc_gen_template_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doc_gen_document_sets" ADD CONSTRAINT "doc_gen_document_sets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_document_sets" ADD CONSTRAINT "doc_gen_document_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_document_sets" ADD CONSTRAINT "doc_gen_document_sets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doc_gen_document_sets" ADD CONSTRAINT "doc_gen_document_sets_current_published_version_id_fkey" FOREIGN KEY ("current_published_version_id") REFERENCES "doc_gen_document_set_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doc_gen_document_set_versions" ADD CONSTRAINT "doc_gen_document_set_versions_document_set_id_fkey" FOREIGN KEY ("document_set_id") REFERENCES "doc_gen_document_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doc_gen_document_set_versions" ADD CONSTRAINT "doc_gen_document_set_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doc_gen_document_set_version_items" ADD CONSTRAINT "doc_gen_document_set_version_items_set_version_id_fkey" FOREIGN KEY ("set_version_id") REFERENCES "doc_gen_document_set_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doc_gen_document_set_version_items" ADD CONSTRAINT "doc_gen_document_set_version_items_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "doc_gen_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "doc_gen_profiles" ADD CONSTRAINT "doc_gen_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_profiles" ADD CONSTRAINT "doc_gen_profiles_linked_customer_id_fkey" FOREIGN KEY ("linked_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doc_gen_profiles" ADD CONSTRAINT "doc_gen_profiles_linked_service_request_id_fkey" FOREIGN KEY ("linked_service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doc_gen_profiles" ADD CONSTRAINT "doc_gen_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_profiles" ADD CONSTRAINT "doc_gen_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doc_gen_generations" ADD CONSTRAINT "doc_gen_generations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_generations" ADD CONSTRAINT "doc_gen_generations_document_set_id_fkey" FOREIGN KEY ("document_set_id") REFERENCES "doc_gen_document_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_generations" ADD CONSTRAINT "doc_gen_generations_document_set_version_id_fkey" FOREIGN KEY ("document_set_version_id") REFERENCES "doc_gen_document_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_generations" ADD CONSTRAINT "doc_gen_generations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "doc_gen_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doc_gen_generations" ADD CONSTRAINT "doc_gen_generations_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "doc_gen_generated_documents" ADD CONSTRAINT "doc_gen_generated_documents_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "doc_gen_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doc_gen_generated_documents" ADD CONSTRAINT "doc_gen_generated_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "doc_gen_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doc_gen_generated_documents" ADD CONSTRAINT "doc_gen_generated_documents_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "doc_gen_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
