
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "shipmentId" TEXT,
ADD COLUMN     "shipmentStatus" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shippingCompany" TEXT,
ADD COLUMN     "shippingDeliveryDays" INTEGER,
ADD COLUMN     "shippingPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingServiceId" INTEGER,
ADD COLUMN     "shippingServiceName" TEXT,
ADD COLUMN     "shippingSummary" TEXT,
ADD COLUMN     "trackingCode" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "heightCm" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "lengthCm" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "weightGrams" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "widthCm" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dataEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAddress" (
    "orderId" TEXT NOT NULL,
    "dataEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAddress_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shipmentId_key" ON "Order"("shipmentId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAddress" ADD CONSTRAINT "OrderAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Placas de vídeo já cadastradas: pacote de envio estimado (32 x 22 x 12 cm, 1,5 kg).
UPDATE "Product" SET "weightGrams" = 1500, "lengthCm" = 32, "widthCm" = 22, "heightCm" = 12
WHERE "name" ILIKE 'Placa de Vídeo%';
