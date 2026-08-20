-- CreateEnum
CREATE TYPE "ModuleMasteryResetPeriod" AS ENUM ('MONTHLY');

-- CreateTable
CREATE TABLE "module_mastery_config" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "metric_type" TEXT NOT NULL DEFAULT 'DISPATCHED_MODULES',
    "slab_size" INTEGER NOT NULL DEFAULT 500,
    "named_level_count" INTEGER NOT NULL DEFAULT 15,
    "god_level_increment" INTEGER NOT NULL DEFAULT 500,
    "god_levels_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reset_period" "ModuleMasteryResetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "leaderboard_visible_to_executives" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_mastery_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_mastery_levels" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "level_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "threshold_modules" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_mastery_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_module_mastery_progress" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "executive_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "modules_dispatched" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "current_level_number" INTEGER NOT NULL DEFAULT 1,
    "current_level_name" TEXT NOT NULL,
    "current_slab_progress" INTEGER NOT NULL DEFAULT 0,
    "next_level_threshold" INTEGER NOT NULL,
    "highest_completed_level" INTEGER NOT NULL DEFAULT 0,
    "is_god_level" BOOLEAN NOT NULL DEFAULT false,
    "god_level_rank" INTEGER NOT NULL DEFAULT 0,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executive_module_mastery_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_module_level_achievements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "executive_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "level_number" INTEGER NOT NULL,
    "level_name" TEXT NOT NULL,
    "is_god_level" BOOLEAN NOT NULL DEFAULT false,
    "god_level_rank" INTEGER NOT NULL DEFAULT 0,
    "threshold_modules" INTEGER NOT NULL,
    "achieved_at" TIMESTAMP(3) NOT NULL,
    "celebration_shown_at" TIMESTAMP(3),
    "celebration_acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_module_level_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "module_mastery_config_company_id_key" ON "module_mastery_config"("company_id");

-- CreateIndex
CREATE INDEX "module_mastery_levels_company_id_idx" ON "module_mastery_levels"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_mastery_levels_company_id_level_number_key" ON "module_mastery_levels"("company_id", "level_number");

-- CreateIndex
CREATE INDEX "executive_module_mastery_progress_company_id_year_month_idx" ON "executive_module_mastery_progress"("company_id", "year", "month");

-- CreateIndex
CREATE INDEX "executive_module_mastery_progress_executive_id_idx" ON "executive_module_mastery_progress"("executive_id");

-- CreateIndex
CREATE UNIQUE INDEX "executive_module_mastery_progress_company_id_executive_id_year_month_key" ON "executive_module_mastery_progress"("company_id", "executive_id", "year", "month");

-- CreateIndex
CREATE INDEX "executive_module_level_achievements_executive_id_year_month_idx" ON "executive_module_level_achievements"("executive_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "executive_module_level_achievements_company_id_executive_id_year_month_level_number_god_level_rank_key" ON "executive_module_level_achievements"("company_id", "executive_id", "year", "month", "level_number", "god_level_rank");

-- AddForeignKey
ALTER TABLE "module_mastery_config" ADD CONSTRAINT "module_mastery_config_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_mastery_levels" ADD CONSTRAINT "module_mastery_levels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_module_mastery_progress" ADD CONSTRAINT "executive_module_mastery_progress_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_module_mastery_progress" ADD CONSTRAINT "executive_module_mastery_progress_executive_id_fkey" FOREIGN KEY ("executive_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_module_level_achievements" ADD CONSTRAINT "executive_module_level_achievements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_module_level_achievements" ADD CONSTRAINT "executive_module_level_achievements_executive_id_fkey" FOREIGN KEY ("executive_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
