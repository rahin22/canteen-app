-- Orders get a short number the canteen and the family both use — "#3" —
-- counting from 1 each morning, per school.

-- AlterTable
ALTER TABLE "Preorder" ADD COLUMN "orderNumber" INTEGER;
ALTER TABLE "Preorder" ADD COLUMN "schoolId" TEXT;

-- CreateTable: the next number to hand out, per school per service day.
CREATE TABLE "OrderCounter" (
    "schoolId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "issued" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("schoolId","serviceDate")
);

-- AddForeignKey
ALTER TABLE "OrderCounter" ADD CONSTRAINT "OrderCounter_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preorder" ADD CONSTRAINT "Preorder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: take each order's school from the student who placed it.
UPDATE "Preorder" p
SET "schoolId" = u."schoolId"
FROM "User" u
WHERE u."id" = p."studentId" AND u."schoolId" IS NOT NULL;

-- Backfill: number past orders in the sequence they were placed, so existing
-- orders read the same way new ones will. Orders whose student has no school
-- stay unnumbered — there is no series to file them under.
UPDATE "Preorder" p
SET "orderNumber" = n."seq"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "schoolId", "serviceDate" ORDER BY "createdAt", "id"
    ) AS "seq"
  FROM "Preorder"
  WHERE "schoolId" IS NOT NULL
) n
WHERE n."id" = p."id";

-- Start each day's counter where the backfill left off, so today's next order
-- doesn't collide with one already on the kitchen's list.
INSERT INTO "OrderCounter" ("schoolId", "serviceDate", "issued")
SELECT "schoolId", "serviceDate", MAX("orderNumber")
FROM "Preorder"
WHERE "schoolId" IS NOT NULL AND "orderNumber" IS NOT NULL
GROUP BY "schoolId", "serviceDate";

-- CreateIndex
CREATE UNIQUE INDEX "Preorder_schoolId_serviceDate_orderNumber_key" ON "Preorder"("schoolId", "serviceDate", "orderNumber");
