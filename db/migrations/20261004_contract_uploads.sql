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
