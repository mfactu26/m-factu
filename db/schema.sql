-- M FactU database foundation
-- This schema stores commercial/account/operational metadata only.
-- Do NOT store prescriptions, medical documents or other health data here
-- until an appropriate health-data hosting architecture is validated.

create extension if not exists pgcrypto;

create table if not exists mfactu_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  siret text,
  city text,
  department text,
  status text not null default 'active' check (status in ('active','paused','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mfactu_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references mfactu_organizations(id) on delete restrict,
  email text not null,
  password_hash text not null,
  display_name text,
  role text not null check (role in ('owner','client')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists mfactu_users_email_unique on mfactu_users (lower(email));

create table if not exists mfactu_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  city text,
  department text,
  email text,
  phone text,
  status text not null default 'new',
  score integer check (score between 0 and 100),
  opt_out boolean not null default false,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mfactu_proposals (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references mfactu_prospects(id) on delete set null,
  organization_id uuid references mfactu_organizations(id) on delete set null,
  rate_basis_points integer not null default 350 check (rate_basis_points > 0 and rate_basis_points <= 10000),
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired')),
  public_token_hash text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists mfactu_dossiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mfactu_organizations(id) on delete restrict,
  reference text not null,
  trip_date date,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  status text not null default 'to_process',
  patient_reference text,
  lomaco_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create index if not exists mfactu_dossiers_org_status_idx
  on mfactu_dossiers (organization_id, status, created_at desc);

create table if not exists mfactu_audit_events (
  id bigserial primary key,
  actor_user_id uuid references mfactu_users(id) on delete set null,
  organization_id uuid references mfactu_organizations(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on column mfactu_dossiers.patient_reference is
  'Operational pseudonymous reference only. Do not store patient name, diagnosis, prescription details, or documents here until approved health-data hosting is enabled.';


-- Billing / Stripe integration
alter table mfactu_organizations
  add column if not exists stripe_customer_id text,
  add column if not exists billing_email text,
  add column if not exists billing_collection_method text not null default 'charge_automatically'
    check (billing_collection_method in ('charge_automatically','send_invoice'));

create unique index if not exists mfactu_organizations_stripe_customer_unique
  on mfactu_organizations (stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists mfactu_billing_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mfactu_organizations(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  teletransmitted_turnover_cents bigint not null check (teletransmitted_turnover_cents >= 0),
  fee_basis_points integer not null default 350 check (fee_basis_points = 350),
  fee_cents bigint not null check (fee_cents >= 0),
  stripe_invoice_id text,
  stripe_invoice_status text,
  hosted_invoice_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (organization_id, period_start, period_end)
);

create unique index if not exists mfactu_billing_periods_stripe_invoice_unique
  on mfactu_billing_periods (stripe_invoice_id)
  where stripe_invoice_id is not null;

create table if not exists mfactu_commercial_events (
  id bigserial primary key,
  event_type text not null,
  prospect_id uuid references mfactu_prospects(id) on delete set null,
  organization_id uuid references mfactu_organizations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mfactu_commercial_events_created_idx
  on mfactu_commercial_events (created_at desc, event_type);

create table if not exists mfactu_report_runs (
  id bigserial primary key,
  report_type text not null default 'daily-commercial',
  period_start timestamptz not null,
  period_end timestamptz not null,
  recipient text,
  provider_message_id text,
  status text not null default 'pending',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


-- One-use links and signed commercial contract PDFs.
-- Medical documents and patient records remain out of scope.
create table if not exists mfactu_contract_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references mfactu_prospects(id) on delete restrict,
  organization_id uuid references mfactu_organizations(id) on delete restrict,
  token_hash text not null unique,
  created_by uuid references mfactu_users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check ((prospect_id is not null) <> (organization_id is not null))
);

create index if not exists mfactu_contract_upload_tokens_expiry_idx
  on mfactu_contract_upload_tokens (expires_at)
  where used_at is null;

create table if not exists mfactu_contract_documents (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references mfactu_prospects(id) on delete restrict,
  organization_id uuid references mfactu_organizations(id) on delete restrict,
  upload_token_id uuid not null unique references mfactu_contract_upload_tokens(id) on delete restrict,
  filename text not null,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 3145728),
  sha256 text not null,
  file_data bytea not null,
  uploaded_at timestamptz not null default now(),
  check ((prospect_id is not null)::int + (organization_id is not null)::int = 1)
);

create index if not exists mfactu_contract_documents_prospect_idx
  on mfactu_contract_documents (prospect_id, uploaded_at desc)
  where prospect_id is not null;
create index if not exists mfactu_contract_documents_org_idx
  on mfactu_contract_documents (organization_id, uploaded_at desc)
  where organization_id is not null;

comment on table mfactu_contract_documents is
  'Signed commercial contract PDFs only. Do not store prescriptions, patient records, or health data here.';
