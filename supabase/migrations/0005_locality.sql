-- People can sign up from anywhere. Outside the covered areas there is no zone yet, so we
-- keep the town/LGA they typed; it shows where to expand next and lets us alert them once
-- their area is added.
alter table residents add column if not exists locality text;
create index if not exists residents_outside_coverage_idx on residents (lower(locality)) where zone_id is null;
