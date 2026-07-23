-- Adds columns to persist the raw Mulkiya / bank settlement letter photos a
-- seller uploads at the Details stage. Previously these images were only ever
-- passed through Claude Vision for extraction and then discarded — if the
-- extraction misread a field, there was no way for admin to go back and check
-- the source document. Now every upload (whether extraction succeeds or
-- fails) is saved to the existing private `deal-documents` Storage bucket
-- (see 0004_documents_bucket.sql) and the signed URL is recorded here so the
-- admin panel can display/link to it.
--
-- Run this file in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).

alter table deals add column if not exists mulkiya_image_url text;
alter table deals add column if not exists settlement_image_url text;
