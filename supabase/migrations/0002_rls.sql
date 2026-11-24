-- Row Level Security.
--
-- The Next.js server talks to Postgres directly as the table owner (DATABASE_URL), which
-- bypasses RLS; role checks happen in the API layer. RLS is the second line of defence
-- for anything reaching the database through Supabase's PostgREST/Realtime with the
-- anon key or a user JWT: nothing is readable without an app_role claim.
--
--   operator/admin  read everything operational
--   volunteer       read own volunteer row and own rescue jobs
--   anon            nothing
--
-- On plain Postgres (local docker) we create the Supabase roles and auth.jwt() shim so the
-- same migration applies everywhere.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;

do $$ begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    execute $f$
      create function auth.jwt() returns jsonb language sql stable as
      $b$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $b$
    $f$;
  end if;
end $$;

create or replace function public.app_role() returns text language sql stable as
$$ select coalesce(auth.jwt() ->> 'app_role', auth.jwt() -> 'app_metadata' ->> 'app_role', '') $$;

create or replace function public.is_operator() returns boolean language sql stable as
$$ select public.app_role() in ('operator', 'admin') $$;

do $$
declare t text;
begin
  foreach t in array array[
    'zones','landmarks','flood_extents','rainfall_readings','zone_risk_snapshots',
    'residents','vulnerable_members','family_contacts','volunteers','shelters',
    'help_requests','rescue_jobs','volunteer_positions','crowd_reports','checkins',
    'alerts','alert_deliveries','inbound_messages','outbound_messages',
    'app_users','otp_codes','audit_log','demo_state'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Operators/admins can read operational tables (not credentials).
  foreach t in array array[
    'zones','landmarks','flood_extents','rainfall_readings','zone_risk_snapshots',
    'residents','vulnerable_members','family_contacts','volunteers','shelters',
    'help_requests','rescue_jobs','volunteer_positions','crowd_reports','checkins',
    'alerts','outbound_messages','audit_log','demo_state'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_operator())', t || '_operator_read', t);
  end loop;
end $$;

-- Admins may update operational records directly (operators go through the API).
create policy help_requests_admin_write on public.help_requests for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Volunteers see themselves and their own jobs.
create policy volunteers_self_read on public.volunteers for select to authenticated
  using (id::text = auth.jwt() ->> 'volunteer_id');
create policy rescue_jobs_self_read on public.rescue_jobs for select to authenticated
  using (volunteer_id::text = auth.jwt() ->> 'volunteer_id');

-- Public reference data needed by the registration form (no personal data).
create policy zones_public_read on public.zones for select to anon using (true);
create policy landmarks_public_read on public.landmarks for select to anon using (true);
create policy shelters_public_read on public.shelters for select to anon using (true);
