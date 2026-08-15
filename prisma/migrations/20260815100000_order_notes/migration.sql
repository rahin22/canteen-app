-- Parents can leave a short special request with an order — "no sauce",
-- "allergic to sesame" — which the canteen reads off the day's list.
-- Existing orders simply have none.

-- AlterTable
ALTER TABLE "Preorder" ADD COLUMN "notes" TEXT;
