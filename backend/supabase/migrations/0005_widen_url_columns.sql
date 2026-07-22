-- Widen deals.*_url columns from varchar(500) to text.
--
-- Discovered live in production (2026-07-22) via a manual end-to-end deal
-- walkthrough: Supabase Storage signed URLs (used since the storageService.js
-- migration away from local-disk PDF storage) run ~550-590 characters, which
-- exceeds the varchar(500) limit set in 0001_init.sql (back when these
-- columns only ever held short local file paths). Every write to doc001_url/
-- doc002_url/doc003_url/transfer_cert_url/fines_screenshot_url has been
-- failing with "value too long for type character varying(500)" — and
-- because none of the calling code (dealController.generateDocs,
-- dealFlowEngine.generateAndSendDocuments) checked the .update() error
-- result, every one of these failures was completely silent: the API
-- returned 200 with a real signed URL in the response, but the deal row's
-- doc00X_url column was never actually updated.
--
-- text has no length limit and no storage/performance penalty vs varchar(n)
-- in Postgres, so this is a straightforward widen with no downside.
--
-- Run this file in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).

alter table deals alter column doc001_url type text;
alter table deals alter column doc002_url type text;
alter table deals alter column doc003_url type text;
alter table deals alter column transfer_cert_url type text;
alter table deals alter column fines_screenshot_url type text;
