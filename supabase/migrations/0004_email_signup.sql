-- Landing-page sign-up with email. Alert emails go only to CONFIRMED addresses
-- (double opt-in), and every alert email carries a one-click unsubscribe link.
alter table residents add column if not exists email_verified_at timestamptz;
alter table residents add column if not exists email_opt_out boolean not null default false;
-- One account per email address (case-insensitive), so an address can't be attached to many phones.
create unique index if not exists residents_email_unique on residents (lower(email)) where email is not null;
