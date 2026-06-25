-- Missing Child Finder — Supabase setup.
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It creates the two tables and a public "photos" storage bucket.

create extension if not exists pgcrypto;

-- Registered missing children.
create table if not exists children (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  age_when_missing text default '',
  date_missing     text not null,
  parent_name      text not null,
  parent_email     text default '',
  parent_phone     text default '',
  photo_url        text not null,
  descriptor       jsonb not null,            -- the 128-number face fingerprint
  reported_at      timestamptz not null default now()
);

-- Alerts created when an uploaded photo strongly matches a registered child.
create table if not exists alerts (
  id               uuid primary key default gen_random_uuid(),
  child_id         uuid references children(id) on delete set null,
  child_name       text,
  child_photo_url  text,
  parent_name      text,
  parent_email     text,
  parent_phone     text,
  match_percent    int,
  found_photo_url  text,
  finder_name      text default '',
  finder_contact   text default '',
  location         text default '',
  note             text default '',
  status           text default 'unconfirmed',
  notified         boolean default false,     -- was the family emailed/texted?
  notify_error     text,                       -- delivery error, if any
  created_at       timestamptz not null default now()
);

-- If you created the alerts table before the notification feature existed,
-- run these once to add the new columns (safe to run repeatedly):
alter table alerts add column if not exists notified boolean default false;
alter table alerts add column if not exists notify_error text;

-- Public bucket for the photos. Public read is required so the browser can
-- display the stored images. Writes go through the server using the service
-- role key, so no extra storage policies are needed.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;
