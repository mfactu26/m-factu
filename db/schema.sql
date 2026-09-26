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
