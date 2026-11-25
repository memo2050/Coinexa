-- Cyber Security Scan Agent — Phase 1: linked Windows PCs and signed scan uploads.
--
-- Same isolation model as recruitment: every row carries organization_id, RLS is on
-- with no policies and no browser grants, so only the `securityScan` server function
-- (service role) can read or write. It checks workspace membership and role on every
-- company request, and checks an Ed25519 signature on every device request.
-- Network addresses, host names and MAC addresses are stored encrypted (AES-GCM,
-- key held only as the SECURITY_DATA_KEY server secret).

-- One-time codes an owner/admin creates to link a PC. Only a SHA-256 hash is kept.
create table public.security_pairing_codes (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  device_id text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index security_pairing_codes_org_idx on public.security_pairing_codes (organization_id, created_date desc);

-- A linked PC. The private signing key never leaves the PC; only its public key is here.
create table public.security_devices (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  platform text not null default 'windows' check (platform in ('windows')),
  app_version text,
  public_key text not null unique check (public_key ~ '^[A-Za-z0-9+/]{43}=$'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index security_devices_org_idx on public.security_devices (organization_id, status);

-- One uploaded scan. (device_id, nonce) is unique, so a captured upload cannot be replayed.
create table public.security_scans (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  device_id text not null references public.security_devices (id) on delete cascade,
  nonce text not null check (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  signed_at timestamptz not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  schema_version text not null,
  scanner_version text,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  networks_enc text not null,
  network_summary text not null,
  authorized_by text not null check (char_length(authorized_by) between 2 and 120),
  authorization_statement text not null,
  host_count int not null default 0 check (host_count between 0 and 1024),
  open_port_count int not null default 0 check (open_port_count >= 0),
  status text not null default 'received' check (status in ('received', 'analysed', 'failed')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text,
  constraint security_scans_nonce_once unique (device_id, nonce),
  constraint security_scans_time_order check (started_at <= finished_at)
);
create index security_scans_org_idx on public.security_scans (organization_id, created_date desc);

-- Devices found by a scan. Address, host name and MAC are encrypted in identity_enc.
create table public.security_scan_hosts (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  scan_id text not null references public.security_scans (id) on delete cascade,
  identity_enc text not null,
  ip_sort bigint not null,
  vendor text,
  device_type text,
  os_guess text,
  ports jsonb not null default '[]' check (jsonb_typeof(ports) = 'array' and jsonb_array_length(ports) <= 200),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index security_scan_hosts_scan_idx on public.security_scan_hosts (scan_id, ip_sort);

do $$
declare t text;
begin
  foreach t in array array['security_pairing_codes', 'security_devices', 'security_scans', 'security_scan_hosts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.tg_stamp_insert()', t || '_stamp_insert', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_stamp_update()', t || '_stamp_update', t);
  end loop;
end $$;
