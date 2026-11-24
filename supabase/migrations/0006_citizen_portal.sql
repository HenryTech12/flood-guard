-- Citizen portal + authority dashboard (Guardy features) on top of the FloodGuard pipeline.

-- Flood events: weather-triggered, uploaded by operators, or raised by the zone risk engine.
create table if not exists flood_events (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  latitude double precision not null,
  longitude double precision not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  rainfall real,
  description text,
  source text not null default 'manual' check (source in ('weather', 'manual', 'upload', 'zone', 'demo')),
  zone_id text references zones(id) on delete set null,
  notified_count int not null default 0,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists flood_events_time_idx on flood_events (timestamp desc);

-- Web emergency reports carry who reported, what they need and a readable place name.
alter table help_requests add column if not exists reporter_name text;
alter table help_requests add column if not exists type_of_need text;
alter table help_requests add column if not exists location_name text;
alter table help_requests add column if not exists has_voice boolean not null default false;
alter table help_requests add column if not exists notified_centers jsonb not null default '[]';

-- Voice messages recorded in the browser (kept out of help_requests so list queries stay light).
create table if not exists voice_recordings (
  help_request_id uuid primary key references help_requests(id) on delete cascade,
  mime text not null,
  size_bytes int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

-- Emergency centres = shelters and hospitals (notified about nearby reports).
alter table shelters add column if not exists type text not null default 'shelter';
alter table shelters drop constraint if exists shelters_type_check;
alter table shelters add constraint shelters_type_check check (type in ('shelter', 'hospital'));
alter table shelters add column if not exists email text;

alter table flood_events enable row level security;
alter table voice_recordings enable row level security;
drop policy if exists flood_events_public_read on flood_events;
create policy flood_events_public_read on flood_events for select to anon, authenticated using (true);
drop policy if exists voice_operator_read on voice_recordings;
create policy voice_operator_read on voice_recordings for select to authenticated using (public.is_operator());
