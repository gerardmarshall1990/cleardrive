-- Adds a column to persist the seller's proof-of-bank-account screenshot
-- (online banking screenshot or bank statement showing IBAN + account holder
-- name) uploaded at the Details stage. This exists so a seller can't just
-- type in any IBAN/account name for "Your proceeds account" — Claude Vision
-- extracts the account holder name from the photo and it's cross-checked
-- against the seller's own verified identity (users.full_name, populated
-- during the KYC stage) before the deal can proceed, preventing proceeds
-- being routed to someone else's bank account. The raw photo is saved
-- (mirrors mulkiya_image_url/settlement_image_url, see 0007) so admin can
-- pull it up if a name-match ever needs manual review.
--
-- Run this file in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).

alter table deals add column if not exists bank_proof_image_url text;
