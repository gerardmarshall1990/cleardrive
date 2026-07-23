-- Adds persisted "verified" boolean flags for the four Claude Vision upload
-- checks that previously only lived as ephemeral frontend React state
-- (mulkiyaVerified/mulkiyaBackVerified/settlementVerified/bankProofVerified
-- in DealDetail.jsx/.js) with zero backing DB column. Two problems this
-- caused: (1) a page refresh mid-Details-stage silently lost "already
-- uploaded/verified" progress even though the underlying image was saved,
-- forcing a pointless re-upload; (2) admin had no override lever at all for
-- these four checks — unlike fines_verified, which already had both a real
-- column and an admin override — so a legitimate edge case Claude Vision
-- kept failing (e.g. a genuinely faded Mulkiya, or a bank statement with a
-- valid-but-differently-formatted name) had no remedy.
--
-- Run this file in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).

alter table deals add column if not exists mulkiya_verified boolean not null default false;
alter table deals add column if not exists mulkiya_back_verified boolean not null default false;
alter table deals add column if not exists settlement_verified boolean not null default false;
alter table deals add column if not exists bank_proof_verified boolean not null default false;

-- fines_verify already had a `fines_verified` column, but the raw RTA
-- screenshot itself was never persisted (unlike mulkiya/settlement/bank-proof,
-- which all save their source photo) — admin had no way to review the
-- original document if a fines-amount dispute came up later.
alter table deals add column if not exists fines_screenshot_url text;
