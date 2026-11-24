-- FloodGuard schema (Postgres 15+ with PostGIS). Works on Supabase and on plain PostGIS.
-- All geometries are EPSG:4326 (lng/lat). Distances use ::geography.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- sense layer
create table zones (
  id text primary key,
  region_id text not null,
  name text not null,
  short_name text not null,
  lga text not null,
  geom geometry(Polygon, 4326) not null,
  centroid geometry(Point, 4326) not null,
  base_risk_score real not null check (base_risk_score between 0 and 1),
  historically_flooded boolean not null default false,
  current_risk_level text not null default 'low' check (current_risk_level in ('low','medium','high','severe')),
  current_risk_score real not null default 0,
  risk_reasons jsonb not null default '[]',
  rain_24h_mm real not null default 0,
  rain_72h_mm real not null default 0,
  flood_overlap real not null default 0,          -- share of zone inside the stored flood extent (0..1)
  override_level text check (override_level in ('low','medium','high','severe')),
  updated_at timestamptz not null default now()
);
create index zones_geom_idx on zones using gist (geom);

create table landmarks (
  id text primary key,
  zone_id text not null references zones(id) on delete cascade,
  name text not null,
  geom geometry(Point, 4326) not null
);

create table flood_extents (
  id text primary key,
  label text not null,
  source text not null,
  synthetic boolean not null default false,
  observed_at timestamptz not null,
  active boolean not null default true,
  geom geometry(MultiPolygon, 4326) not null
);
create index flood_extents_geom_idx on flood_extents using gist (geom);

create table rainfall_readings (
  zone_id text not null references zones(id) on delete cascade,
  ts timestamptz not null,           -- end of the accumulation interval
  mm real not null,
  source text not null,
  primary key (zone_id, ts)
);

create table zone_risk_snapshots (
  id bigserial primary key,
  zone_id text not null references zones(id) on delete cascade,
  level text not null,
  score real not null,
  reasons jsonb not null default '[]',
  rain_24h_mm real,
  sim_time timestamptz,
  at timestamptz not null default now()
);
create index zone_risk_snapshots_at_idx on zone_risk_snapshots (at);

-- ---------------------------------------------------------------- people
create table residents (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  preferred_language text not null default 'en' check (preferred_language in ('en','pcm','ha','yo','ig')),
  home geometry(Point, 4326),                -- only stored with consent_location = true
  zone_id text references zones(id),
  consent_location boolean not null default false,
  consent_at timestamptz,
  registered_by text,                        -- 'self' | 'ussd' | community volunteer name
  alerts_opt_out boolean not null default false,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint home_requires_consent check (home is null or consent_location)
);
create index residents_zone_idx on residents (zone_id);

create table vulnerable_members (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id) on delete cascade,
  type text not null check (type in ('elderly','disabled','pregnant','child_under5','bedridden','other')),
  count int not null default 1 check (count > 0),
  notes text
);
create index vulnerable_members_resident_idx on vulnerable_members (resident_id);

create table family_contacts (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id) on delete cascade,
  phone text not null,
  name text
);
create index family_contacts_resident_idx on family_contacts (resident_id);

create table volunteers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  type text not null check (type in ('boat','vehicle','on_foot','medical')),
  capacity int not null default 4,
  current_location geometry(Point, 4326),
  home_location geometry(Point, 4326),
  is_available boolean not null default true,
  is_simulated boolean not null default true,  -- demo: autopilot may drive simulated volunteers
  sim_move boolean not null default false,     -- demo: tick moves this volunteer towards its job
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table shelters (
  id text primary key,
  name text not null,
  geom geometry(Point, 4326) not null,
  capacity int not null,
  current_occupancy int not null default 0,
  initial_occupancy int not null default 0,
  contact_phone text
);

-- ---------------------------------------------------------------- response
create sequence help_ref_seq start 1001;

create table help_requests (
  id uuid primary key default gen_random_uuid(),
  ref_code text not null unique default ('FG-' || nextval('help_ref_seq')),
  resident_id uuid references residents(id) on delete set null,
  phone text not null,
  location geometry(Point, 4326) not null,
  location_source text not null check (location_source in ('registered','ussd_landmark','gps','zone_centroid','unknown')),
  landmark_id text references landmarks(id),
  zone_id text references zones(id),
  people_count int not null default 1 check (people_count > 0),
  vulnerable_flag boolean not null default false,
  vulnerable jsonb not null default '[]',      -- [{type, count}] snapshot used for scoring
  message text,
  channel text not null default 'sms' check (channel in ('sms','ussd','web','demo')),
  urgency_score int not null default 0,
  urgency_reasons jsonb not null default '[]',
  inside_flood boolean not null default false,
  status text not null default 'new' check (status in ('new','assigned','en_route','rescued','cancelled','duplicate')),
  assigned_volunteer_id uuid references volunteers(id) on delete set null,
  failed_attempts int not null default 0,
  merged_count int not null default 0,
  shelter_id text references shelters(id),
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rescued_at timestamptz
);
create index help_requests_status_idx on help_requests (status);
create index help_requests_phone_idx on help_requests (phone, created_at desc);
create index help_requests_location_idx on help_requests using gist (location);

create table rescue_jobs (
  id uuid primary key default gen_random_uuid(),
  help_request_id uuid not null references help_requests(id) on delete cascade,
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered','accepted','declined','expired','cancelled','completed','failed')),
  operator_assigned boolean not null default false,
  distance_m int,
  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('rescued','could_not_reach','reassigned','cancelled')),
  shelter_id text references shelters(id)
);
-- One live offer/job per volunteer and per request.
create unique index rescue_jobs_one_live_per_volunteer on rescue_jobs (volunteer_id) where status in ('offered','accepted');
create unique index rescue_jobs_one_live_per_request on rescue_jobs (help_request_id) where status in ('offered','accepted');
create index rescue_jobs_request_idx on rescue_jobs (help_request_id);

create table volunteer_positions (
  id bigserial primary key,
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  job_id uuid references rescue_jobs(id) on delete set null,
  geom geometry(Point, 4326) not null,
  at timestamptz not null default now()
);
create index volunteer_positions_idx on volunteer_positions (volunteer_id, at);

create table crowd_reports (
  id uuid primary key default gen_random_uuid(),
  phone text,
  resident_id uuid references residents(id) on delete set null,
  location geometry(Point, 4326) not null,
  location_source text not null default 'zone_centroid',
  zone_id text references zones(id),
  landmark_id text references landmarks(id),
  type text not null check (type in ('water_level','road_blocked','drain_blocked','other')),
  water_depth_estimate int,                  -- cm
  description text,
  photo_url text,
  channel text not null default 'sms',
  verification_status text not null default 'unverified' check (verification_status in ('unverified','consistent','suspicious')),
  verification_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index crowd_reports_created_idx on crowd_reports (created_at);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid references residents(id) on delete cascade,
  phone text not null,
  status text not null check (status in ('safe','need_help')),
  channel text not null default 'sms',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- alerts
create table alerts (
  id uuid primary key default gen_random_uuid(),
  zone_id text references zones(id) on delete cascade,
  level text not null,
  language text not null,
  channel text not null check (channel in ('sms','voice','radio_script')),
  message text not null,
  sent_count int not null default 0,
  fallback_from text,                        -- requested language when English was used instead
  created_by text,
  created_at timestamptz not null default now()
);

create table alert_deliveries (
  resident_id uuid not null references residents(id) on delete cascade,
  channel text not null,
  zone_id text not null,
  level text not null,
  sent_at timestamptz not null default now(),
  primary key (resident_id, channel)
);

-- ---------------------------------------------------------------- messaging
create table inbound_messages (
  id bigserial primary key,
  provider text not null,
  provider_message_id text not null,
  channel text not null,                     -- sms | ussd
  from_phone text not null,
  body text,
  response text,
  result jsonb,
  received_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);
create index inbound_messages_from_idx on inbound_messages (from_phone, received_at);

create table outbound_messages (
  id bigserial primary key,
  provider text,
  channel text not null check (channel in ('sms','voice')),
  to_phone text not null,
  body text not null,
  audio_url text,
  language text,
  purpose text not null,
  ref_type text,
  ref_id text,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbound_messages_queue_idx on outbound_messages (status, next_attempt_at);
create index outbound_messages_to_idx on outbound_messages (to_phone, created_at);

-- ---------------------------------------------------------------- auth + ops
create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('operator','admin')),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table otp_codes (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);

create table audit_log (
  id bigserial primary key,
  actor text not null,
  entity text not null,
  entity_id text not null,
  action text not null,
  from_value text,
  to_value text,
  details jsonb,
  at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id, at);
create index audit_log_at_idx on audit_log (at);

create table demo_state (
  id int primary key default 1 check (id = 1),
  replay_running boolean not null default false,
  replay_sim_start timestamptz,
  replay_sim_end timestamptz,
  replay_wall_start timestamptz,
  replay_speed real not null default 14400,  -- simulated seconds per wall-clock second
  sim_time timestamptz,                      -- null = live (wall clock)
  autopilot boolean not null default false,
  move_volunteers boolean not null default false,
  auto_alerts boolean not null default true,
  last_tick_at timestamptz not null default 'epoch',
  last_move_at timestamptz,
  demo_started_at timestamptz not null default now()
);
insert into demo_state (id) values (1) on conflict do nothing;
