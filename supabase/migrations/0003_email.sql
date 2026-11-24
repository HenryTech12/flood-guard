-- Email notifications (Brevo). Email is an optional extra channel next to SMS/voice:
--   • residents and family contacts may give an email address (with the same consent)
--   • outbound_messages carries email (recipient, subject, HTML body)
--   • alerts can be logged with channel 'email'

alter table residents add column if not exists email text;
alter table family_contacts add column if not exists email text;

alter table outbound_messages alter column to_phone drop not null;
alter table outbound_messages add column if not exists to_email text;
alter table outbound_messages add column if not exists subject text;
alter table outbound_messages add column if not exists html_body text;

alter table outbound_messages drop constraint if exists outbound_messages_channel_check;
alter table outbound_messages add constraint outbound_messages_channel_check check (channel in ('sms', 'voice', 'email'));
alter table outbound_messages add constraint outbound_messages_recipient_check
  check ((channel = 'email' and to_email is not null) or (channel <> 'email' and to_phone is not null));
create index if not exists outbound_messages_email_idx on outbound_messages (to_email, created_at);

alter table alerts drop constraint if exists alerts_channel_check;
alter table alerts add constraint alerts_channel_check check (channel in ('sms', 'voice', 'email', 'radio_script'));

-- A help request triggers at most one "critical" ops email, the first time its urgency
-- reaches OPS_NOTIFY_MIN_URGENCY (at creation, or later as zone risk / waiting time grow).
alter table help_requests add column if not exists ops_notified_at timestamptz;
