-- Normalize legacy customer payments after taking a database backup.
UPDATE customer_payments
SET status = 'PAID',
    updated_at = NOW()
WHERE paid_amount > 0
  AND status = 'UNPAID';
