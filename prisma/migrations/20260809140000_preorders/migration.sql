-- CreateEnum
CREATE TYPE "PreorderStatus" AS ENUM ('PENDING', 'COLLECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PreorderSource" AS ENUM ('KIOSK', 'PARENT');

-- CreateTable
CREATE TABLE "Preorder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "placedById" TEXT,
    "source" "PreorderSource" NOT NULL,
    "items" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "status" "PreorderStatus" NOT NULL DEFAULT 'PENDING',
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,
    "collectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Preorder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Preorder_transactionId_key" ON "Preorder"("transactionId");

-- CreateIndex
CREATE INDEX "Preorder_serviceDate_status_idx" ON "Preorder"("serviceDate", "status");

-- CreateIndex
CREATE INDEX "Preorder_studentId_serviceDate_idx" ON "Preorder"("studentId", "serviceDate");

-- AddForeignKey
ALTER TABLE "Preorder" ADD CONSTRAINT "Preorder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preorder" ADD CONSTRAINT "Preorder_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preorder" ADD CONSTRAINT "Preorder_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
