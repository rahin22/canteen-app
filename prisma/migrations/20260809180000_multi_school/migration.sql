-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- Seed the two schools this deployment serves. Admins can add more from
-- Settings; these two exist up front so the backfill below has a home.
INSERT INTO "School" ("id", "name", "sortOrder") VALUES
  ('sch_islamic_canberra', 'Islamic School Canberra', 0),
  ('sch_taqwa', 'Taqwa School', 1);

-- AlterTable: everyone can belong to a school (students always do).
ALTER TABLE "User" ADD COLUMN "schoolId" TEXT;

-- Existing students predate multi-school support, so they belong to the
-- school this system was originally set up for.
UPDATE "User" SET "schoolId" = 'sch_islamic_canberra' WHERE "role" = 'STUDENT';

-- AlterTable: menus are per-school. Added nullable, backfilled, then locked
-- down — an existing row can't be NOT NULL without a value first.
ALTER TABLE "MenuItem" ADD COLUMN "schoolId" TEXT;
UPDATE "MenuItem" SET "schoolId" = 'sch_islamic_canberra' WHERE "schoolId" IS NULL;
ALTER TABLE "MenuItem" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable: the old "schoolId" here was the school-issued student ID, which
-- now collides with the School relation. Rename it to say what it is.
ALTER TABLE "ChildRegistration" RENAME COLUMN "schoolId" TO "studentIdCode";
ALTER TABLE "ChildRegistration" ADD COLUMN "schoolId" TEXT;
UPDATE "ChildRegistration" SET "schoolId" = 'sch_islamic_canberra';

-- CreateIndex
CREATE INDEX "MenuItem_schoolId_active_idx" ON "MenuItem"("schoolId", "active");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildRegistration" ADD CONSTRAINT "ChildRegistration_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
