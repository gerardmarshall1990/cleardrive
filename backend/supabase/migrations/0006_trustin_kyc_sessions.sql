-- Run this manually in the Supabase SQL Editor (see 0004_documents_bucket.sql
-- for the project's migration convention — these files are not auto-applied).
--
-- Backs the new TrustIn/UAE Pass identity-verification (KYC) flow. TrustIn is
-- an ADGM/FSRA-regulated escrow partner and cannot white-label KYC — each
-- party must verify directly with TrustIn via UAE Pass before TrustIn will
-- hold escrow funds for a deal. This table correlates an in-flight
-- verification session (per deal + party) to the webhook/callback that
-- confirms it, since the existing trustin_deal_id correlation used for
-- escrow events doesn't exist yet this early in the deal flow (KYC happens
-- before ESCROW).
create table if not exists trustin_kyc_sessions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  party text not null check (party in ('seller', 'buyer')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  full_name text,
  emirates_id text,
  nationality text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (deal_id, party)
);

create index if not exists idx_trustin_kyc_sessions_deal on trustin_kyc_sessions(deal_id);
