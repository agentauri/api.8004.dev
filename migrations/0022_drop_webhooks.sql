-- Migration 0022: Drop webhook tables
-- Reason: Webhooks feature was never fully implemented (stub code)
-- The webhook API routes worked but events were never triggered
-- Removing to clean up unused code

-- Drop indexes first
DROP INDEX IF EXISTS idx_webhook_deliveries_webhook;
DROP INDEX IF EXISTS idx_webhook_deliveries_status;
DROP INDEX IF EXISTS idx_webhooks_active;
DROP INDEX IF EXISTS idx_webhooks_owner;

-- Drop tables (deliveries first due to foreign key)
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhooks;
