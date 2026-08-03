-- AlterTable
ALTER TABLE "companies" ADD COLUMN "is_practice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "learning_prompt_dismissed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "learning_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_progress_user_id_idx" ON "learning_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_progress_user_id_lesson_id_key" ON "learning_progress"("user_id", "lesson_id");

-- AddForeignKey
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
