-- CreateTable
CREATE TABLE "PickupSlot" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickupSlot_schoolId_active_idx" ON "PickupSlot"("schoolId", "active");

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Preorder" ADD COLUMN "pickupSlotId" TEXT;

-- AddForeignKey
ALTER TABLE "Preorder" ADD CONSTRAINT "Preorder_pickupSlotId_fkey" FOREIGN KEY ("pickupSlotId") REFERENCES "PickupSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: temporarily out of stock, as opposed to withdrawn from the menu.
ALTER TABLE "MenuItem" ADD COLUMN "soldOut" BOOLEAN NOT NULL DEFAULT false;

-- Seed each existing school with the school's standard collection windows.
-- Admins can rename, retime, add and retire these per school afterwards.
INSERT INTO "PickupSlot" ("id", "schoolId", "label", "startTime", "endTime", "sortOrder")
SELECT
  'slot_' || s."id" || '_' || v."ord",
  s."id", v."label", v."startTime", v."endTime", v."ord"
FROM "School" s
CROSS JOIN (VALUES
  ('Secondary Recess', '09:50', '10:20', 0),
  ('Primary Recess',   '10:40', '11:10', 1),
  ('Secondary Lunch',  '12:00', '12:20', 2),
  ('Primary Lunch',    '13:10', '13:50', 3),
  ('Secondary Break',  '14:20', '14:40', 4),
  ('Pick-up Time',     '15:00', '16:00', 5)
) AS v("label", "startTime", "endTime", "ord");

-- Orders now run to the end of the day and roll over to tomorrow, so the old
-- morning cutoff becomes 4pm.
UPDATE "Setting" SET "value" = '16:00' WHERE "key" = 'preorder_cutoff';
