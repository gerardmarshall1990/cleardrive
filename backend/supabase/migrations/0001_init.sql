-- ClearDrive — Initial schema
-- Run this file in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).
-- Direct psql access isn't available with anon/service keys alone, so this is applied manually once.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- USERS
-- ============================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  phone varchar(20),                -- +971XXXXXXXXX
  email varchar(255),
  full_name varchar(255),
  emirates_id varchar(50),
  nationality varchar(100),
  trustin_kyc_status varchar(20) default 'pending', -- pending/complete
  trustin_kyc_data jsonb,
  role varchar(20) not null default 'seller', -- seller/buyer/dealer/broker/admin
  created_at timestamptz not null default now()
);

create index if not exists idx_users_phone on users(phone);
create index if not exists idx_users_role on users(role);

-- ============================================================
-- PARTNERS (Dealers + Brokers)
-- ============================================================
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  company varchar(255),
  phone varchar(20),
  email varchar(255),
  type varchar(20) not null default 'dealer', -- dealer/broker
  bank_details jsonb,
  total_deals integer not null default 0,
  total_earned numeric(12,2) not null default 0,
  tier varchar(20) not null default 'standard', -- standard/loyalty
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_partners_type on partners(type);

-- ============================================================
-- DEAL REF SEQUENCE — supports CD-YYYY-NNN auto increment per year
-- ============================================================
create table if not exists deal_ref_sequence (
  year int primary key,
  last_number int not null default 0
);

create or replace function next_deal_ref() returns varchar as $$
declare
  current_year int := extract(year from now() at time zone 'Asia/Dubai');
  next_number int;
  ref varchar;
begin
  insert into deal_ref_sequence (year, last_number)
  values (current_year, 1)
  on conflict (year) do update set last_number = deal_ref_sequence.last_number + 1
  returning last_number into next_number;

  ref := 'CD-' || current_year || '-' || lpad(next_number::text, 3, '0');
  return ref;
end;
$$ language plpgsql;

-- ============================================================
-- DEALS
-- ============================================================
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  ref varchar(20) unique not null default next_deal_ref(),
  product varchar(20) not null,   -- loanclear/safepay
  status varchar(30) not null default 'quote', -- quote/fines_verify/kyc/details/signing/escrow/tasjeel/complete/cancelled

  -- Seller
  seller_id uuid references users(id),
  seller_kyc_complete boolean not null default false,

  -- Buyer
  buyer_id uuid references users(id),
  buyer_kyc_complete boolean not null default false,

  -- Vehicle
  plate varchar(20),
  make varchar(100),
  model varchar(100),
  year varchar(10),
  colour varchar(50),
  vin varchar(50),
  emirate varchar(50),
  mileage varchar(20),

  -- Financials (AED)
  sale_price numeric(12,2),
  loan_amount numeric(12,2),      -- LoanClear only
  loan_bank varchar(100),         -- LoanClear only
  loan_account varchar(50),       -- LoanClear only
  fines_amount numeric(12,2),
  fines_verified boolean not null default false,
  fines_screenshot_url varchar(500),
  cd_fee numeric(12,2),
  net_proceeds numeric(12,2),

  -- Seller proceeds account
  seller_iban varchar(50),
  seller_acc_name varchar(255),
  seller_proc_bank varchar(100),

  -- TrustIn
  trustin_deal_id varchar(100),
  trustin_escrow_iban varchar(50),
  trustin_status varchar(50),
  funds_confirmed boolean not null default false,
  funds_confirmed_at timestamptz,
  loan_cleared boolean not null default false,
  fines_cleared boolean not null default false,

  -- Documents
  doc001_signnow_id varchar(100),
  doc001_signed boolean not null default false,
  doc001_url varchar(500),
  doc002_signnow_id varchar(100),
  doc002_signed boolean not null default false,
  doc002_url varchar(500),
  doc003_signnow_id varchar(100), -- broker only
  doc003_signed boolean not null default false,
  doc003_url varchar(500),
  transfer_cert_url varchar(500),

  -- Broker/Dealer
  referral_source varchar(30),    -- dealer/broker/dubizzle/facebook/direct
  referral_partner_id uuid references partners(id),
  referral_fee numeric(12,2),
  referral_fee_paid boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deals_ref on deals(ref);
create index if not exists idx_deals_status on deals(status);
create index if not exists idx_deals_seller on deals(seller_id);
create index if not exists idx_deals_buyer on deals(buyer_id);
create index if not exists idx_deals_partner on deals(referral_partner_id);
create index if not exists idx_deals_created_at on deals(created_at);

-- keep updated_at current
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_deals_updated_at on deals;
create trigger trg_deals_updated_at before update on deals
  for each row execute function set_updated_at();

-- ============================================================
-- AUTOMATION LOG
-- ============================================================
create table if not exists automation_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  action varchar(100) not null,       -- e.g. whatsapp_quote_confirmation, chase_kyc
  status varchar(20) not null,        -- sent/failed/skipped
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_log_deal on automation_log(deal_id);
create index if not exists idx_automation_log_created_at on automation_log(created_at);

-- ============================================================
-- WEBHOOK EVENTS
-- ============================================================
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  source varchar(20) not null,        -- trustin/signnow/whatsapp
  event_type varchar(100) not null,
  payload jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_events_source on webhook_events(source);
create index if not exists idx_webhook_events_processed on webhook_events(processed);

-- ============================================================
-- ERROR LOG (referenced by global error handler)
-- ============================================================
create table if not exists error_log (
  id uuid primary key default gen_random_uuid(),
  route varchar(255),
  message text,
  stack text,
  deal_id uuid references deals(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table users enable row level security;
alter table partners enable row level security;
alter table deals enable row level security;
alter table automation_log enable row level security;
alter table webhook_events enable row level security;
alter table error_log enable row level security;

-- Service role (backend) bypasses RLS automatically. Policies below cover
-- direct client access via the anon/authenticated key (e.g. future direct-from-app reads).

-- Users can read/update their own user row
drop policy if exists "users_select_own" on users;
create policy "users_select_own" on users
  for select using (auth.uid() = auth_user_id);

drop policy if exists "users_update_own" on users;
create policy "users_update_own" on users
  for update using (auth.uid() = auth_user_id);

-- Sellers/buyers can view deals they are party to
drop policy if exists "deals_select_party" on deals;
create policy "deals_select_party" on deals
  for select using (
    seller_id in (select id from users where auth_user_id = auth.uid())
    or buyer_id in (select id from users where auth_user_id = auth.uid())
  );

-- Partners table: partners can view their own record
drop policy if exists "partners_select_own" on partners;
create policy "partners_select_own" on partners
  for select using (
    email = (select email from users where auth_user_id = auth.uid())
  );

-- automation_log / webhook_events / error_log: no direct client access (service role only)
drop policy if exists "no_client_access_automation_log" on automation_log;
create policy "no_client_access_automation_log" on automation_log
  for all using (false);

drop policy if exists "no_client_access_webhook_events" on webhook_events;
create policy "no_client_access_webhook_events" on webhook_events
  for all using (false);

drop policy if exists "no_client_access_error_log" on error_log;
create policy "no_client_access_error_log" on error_log
  for all using (false);
