CREATE TYPE "ShippingApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "shipping_applications" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "logistics_company" VARCHAR(160) NOT NULL,
    "tracking_no" VARCHAR(120) NOT NULL,
    "remark" TEXT,
    "status" "ShippingApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipping_application_batches" (
    "id" TEXT NOT NULL,
    "shipping_application_id" TEXT NOT NULL,
    "purchase_info_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_application_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipping_applications_file_id_key" ON "shipping_applications"("file_id");
CREATE INDEX "shipping_applications_order_id_idx" ON "shipping_applications"("order_id");
CREATE INDEX "shipping_applications_status_idx" ON "shipping_applications"("status");
CREATE INDEX "shipping_applications_created_by_id_idx" ON "shipping_applications"("created_by_id");
CREATE INDEX "shipping_applications_approved_by_id_idx" ON "shipping_applications"("approved_by_id");
CREATE INDEX "shipping_applications_created_at_idx" ON "shipping_applications"("created_at");
CREATE UNIQUE INDEX "shipping_application_batches_shipping_application_id_purchase_info_id_key" ON "shipping_application_batches"("shipping_application_id", "purchase_info_id");
CREATE INDEX "shipping_application_batches_purchase_info_id_idx" ON "shipping_application_batches"("purchase_info_id");

ALTER TABLE "shipping_applications" ADD CONSTRAINT "shipping_applications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_applications" ADD CONSTRAINT "shipping_applications_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipping_applications" ADD CONSTRAINT "shipping_applications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipping_applications" ADD CONSTRAINT "shipping_applications_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipping_application_batches" ADD CONSTRAINT "shipping_application_batches_shipping_application_id_fkey" FOREIGN KEY ("shipping_application_id") REFERENCES "shipping_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_application_batches" ADD CONSTRAINT "shipping_application_batches_purchase_info_id_fkey" FOREIGN KEY ("purchase_info_id") REFERENCES "purchase_infos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
