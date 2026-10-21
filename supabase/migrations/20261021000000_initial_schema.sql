-- ===========================================================================
-- Get Involved Van — submissions database
--
-- Stores petition signatures, volunteer sign-ups, contact messages, newsletter
-- subscribers and event RSVPs.
--
-- Security model
--   * Every table has row level security ENABLED and NO policies, and all
--     table privileges are revoked from the public `anon` and `authenticated`
--     roles. Nobody can read or write these tables with the public API key.
--   * The only writer is the `submit` Edge Function, which uses the
--     service-role key (kept as a Supabase secret, never in the website).
--   * The gi_* functions below are executable by `service_role` only.
--   * Organizers read submissions in the Supabase dashboard (Table Editor or
--     SQL Editor), which requires a Supabase login. The `reports` schema holds
--     ready-made export views and is not exposed through the API.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.petition_signatures (
  id               uuid primary key default gen_random_uuid(),
  petition_slug    text not null check (petition_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(petition_slug) <= 120),
  full_name        text not null check (char_length(full_name) between 2 and 120),
  email            text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  email_normalized text generated always as (lower(btrim(email))) stored,
  zip_code         text check (zip_code ~ '^[0-9]{5}$'),
  newsletter_opt_in boolean not null default false,
  consent_version  text not null check (char_length(consent_version) <= 40),
  status           text not null default 'valid' check (status in ('valid', 'removed')),
  created_at       timestamptz not null default now(),
  constraint petition_signatures_one_per_email unique (petition_slug, email_normalized)
);
comment on table public.petition_signatures is
  'Petition signatures. Not identity-verified: one signature per email address per petition. Set status = ''removed'' to exclude a signature from counts and exports.';

create table if not exists public.volunteer_signups (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (char_length(full_name) between 2 and 120),
  email            text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  phone            text check (char_length(phone) <= 30),
  interests        text[] not null default '{}' check (cardinality(interests) between 1 and 20),
  availability     text[] not null default '{}' check (cardinality(availability) <= 10),
  comments         text check (char_length(comments) <= 2000),
  consent_version  text not null check (char_length(consent_version) <= 40),
  status           text not null default 'new' check (status in ('new', 'contacted', 'active', 'archived')),
  created_at       timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 2 and 120),
  email            text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  subject          text not null check (char_length(subject) between 2 and 150),
  message          text not null check (char_length(message) between 10 and 5000),
  status           text not null default 'new' check (status in ('new', 'replied', 'archived', 'spam')),
  created_at       timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  email_normalized text generated always as (lower(btrim(email))) stored,
  status           text not null default 'pending' check (status in ('pending', 'subscribed', 'unsubscribed')),
  -- Secret used in confirmation and unsubscribe links. Rotated on re-subscribe.
  token            uuid not null default gen_random_uuid(),
  source           text not null default 'other' check (char_length(source) <= 40),
  consent_version  text not null check (char_length(consent_version) <= 40),
  created_at       timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz,
  constraint newsletter_subscribers_email_unique unique (email_normalized),
  constraint newsletter_subscribers_token_unique unique (token)
);

create table if not exists public.event_rsvps (
  id               uuid primary key default gen_random_uuid(),
  event_slug       text not null check (event_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(event_slug) <= 120),
  full_name        text not null check (char_length(full_name) between 2 and 120),
  email            text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  email_normalized text generated always as (lower(btrim(email))) stored,
  party_size       smallint not null default 1 check (party_size between 1 and 10),
  status           text not null default 'going' check (status in ('going', 'cancelled')),
  created_at       timestamptz not null default now(),
  constraint event_rsvps_one_per_email unique (event_slug, email_normalized)
);

-- Rate-limiting log. Stores a salted hash of the IP address (never the IP
-- itself) and is pruned automatically after two days.
create table if not exists public.submission_attempts (
  id         bigint generated always as identity primary key,
  ip_hash    text not null check (char_length(ip_hash) <= 128),
  form       text not null check (char_length(form) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists petition_signatures_slug_idx on public.petition_signatures (petition_slug, created_at);
create index if not exists volunteer_signups_created_idx on public.volunteer_signups (created_at desc);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);
create index if not exists event_rsvps_slug_idx on public.event_rsvps (event_slug);
create index if not exists submission_attempts_lookup_idx on public.submission_attempts (ip_hash, form, created_at);
create index if not exists submission_attempts_created_idx on public.submission_attempts (created_at);

-- ---------------------------------------------------------------------------
-- Lock everything down: RLS on, no policies, no privileges for public roles.
-- ---------------------------------------------------------------------------

alter table public.petition_signatures   enable row level security;
alter table public.volunteer_signups     enable row level security;
alter table public.contact_messages      enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.event_rsvps           enable row level security;
alter table public.submission_attempts   enable row level security;

revoke all on table
  public.petition_signatures,
  public.volunteer_signups,
  public.contact_messages,
  public.newsletter_subscribers,
  public.event_rsvps,
  public.submission_attempts
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.petition_signatures,
  public.volunteer_signups,
  public.contact_messages,
  public.newsletter_subscribers,
  public.event_rsvps,
  public.submission_attempts
to service_role;

-- ---------------------------------------------------------------------------
-- Functions used by the Edge Function (service_role only)
-- ---------------------------------------------------------------------------

-- Records one attempt and returns how many attempts this IP hash has made on
-- this form inside the window (including this one).
create or replace function public.gi_rate_limit_hit(p_ip_hash text, p_form text, p_window_seconds integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  attempts integer;
begin
  delete from public.submission_attempts where created_at < now() - interval '2 days';
  insert into public.submission_attempts (ip_hash, form) values (p_ip_hash, p_form);
  select count(*) into attempts
    from public.submission_attempts
   where ip_hash = p_ip_hash
     and form = p_form
     and created_at > now() - make_interval(secs => p_window_seconds);
  return attempts;
end;
$$;

-- Returns 'created' or 'duplicate' (same email already signed this petition).
create or replace function public.gi_sign_petition(
  p_slug text, p_full_name text, p_email text, p_zip text,
  p_newsletter_opt_in boolean, p_consent_version text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.petition_signatures (petition_slug, full_name, email, zip_code, newsletter_opt_in, consent_version)
  values (p_slug, p_full_name, p_email, p_zip, coalesce(p_newsletter_opt_in, false), p_consent_version)
  on conflict on constraint petition_signatures_one_per_email do nothing
  returning id into new_id;
  return case when new_id is null then 'duplicate' else 'created' end;
end;
$$;

create or replace function public.gi_petition_counts(p_slugs text[])
returns table (petition_slug text, signatures bigint)
language sql
stable
set search_path = ''
as $$
  select s.slug, count(ps.id)
    from unnest(p_slugs) as s(slug)
    left join public.petition_signatures ps
      on ps.petition_slug = s.slug and ps.status = 'valid'
   group by s.slug;
$$;

create or replace function public.gi_add_volunteer(
  p_full_name text, p_email text, p_phone text, p_interests text[],
  p_availability text[], p_comments text, p_consent_version text
)
returns uuid
language sql
set search_path = ''
as $$
  insert into public.volunteer_signups (full_name, email, phone, interests, availability, comments, consent_version)
  values (p_full_name, p_email, p_phone, p_interests, coalesce(p_availability, '{}'), p_comments, p_consent_version)
  returning id;
$$;

create or replace function public.gi_add_contact_message(p_name text, p_email text, p_subject text, p_message text)
returns uuid
language sql
set search_path = ''
as $$
  insert into public.contact_messages (name, email, subject, message)
  values (p_name, p_email, p_subject, p_message)
  returning id;
$$;

-- Returns 'created' or 'duplicate'.
create or replace function public.gi_add_rsvp(p_slug text, p_full_name text, p_email text, p_party_size integer)
returns text
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.event_rsvps (event_slug, full_name, email, party_size)
  values (p_slug, p_full_name, p_email, p_party_size)
  on conflict on constraint event_rsvps_one_per_email
    do update set party_size = excluded.party_size, status = 'going'
    where public.event_rsvps.status = 'cancelled'
  returning id into new_id;
  return case when new_id is null then 'duplicate' else 'created' end;
end;
$$;

-- Handles a newsletter sign-up request (double opt-in).
-- action = 'send'               -> send a confirmation email with `token`
--          'throttled'          -> a confirmation was sent in the last 2 minutes
--          'already_subscribed' -> nothing to do
create or replace function public.gi_newsletter_request(p_email text, p_source text, p_consent_version text)
returns table (action text, token uuid)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  existing public.newsletter_subscribers%rowtype;
begin
  select * into existing
    from public.newsletter_subscribers
   where email_normalized = lower(btrim(p_email))
   for update;

  if not found then
    begin
      insert into public.newsletter_subscribers (email, source, consent_version, confirmation_sent_at)
      values (btrim(p_email), p_source, p_consent_version, now())
      returning newsletter_subscribers.token into token;
      action := 'send';
      return next;
      return;
    exception when unique_violation then
      -- A concurrent request created the row first; fall through as throttled.
      action := 'throttled';
      token := null;
      return next;
      return;
    end;
  end if;

  if existing.status = 'subscribed' then
    action := 'already_subscribed';
    token := null;
    return next;
    return;
  end if;

  if existing.status = 'unsubscribed' then
    update public.newsletter_subscribers
       set status = 'pending',
           token = gen_random_uuid(),
           source = p_source,
           consent_version = p_consent_version,
           unsubscribed_at = null,
           confirmation_sent_at = now()
     where id = existing.id
     returning newsletter_subscribers.token into token;
    action := 'send';
    return next;
    return;
  end if;

  -- status = 'pending'
  if existing.confirmation_sent_at is not null and existing.confirmation_sent_at > now() - interval '2 minutes' then
    action := 'throttled';
    token := null;
    return next;
    return;
  end if;

  update public.newsletter_subscribers
     set confirmation_sent_at = now(), consent_version = p_consent_version
   where id = existing.id;
  action := 'send';
  token := existing.token;
  return next;
end;
$$;

-- Clears the resend throttle when a confirmation email failed to send, so the
-- person can try again right away.
create or replace function public.gi_newsletter_send_failed(p_token uuid)
returns void
language sql
set search_path = ''
as $$
  update public.newsletter_subscribers set confirmation_sent_at = null where token = p_token and status = 'pending';
$$;

-- Returns 'confirmed', 'already_confirmed' or 'invalid'.
create or replace function public.gi_newsletter_confirm(p_token uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  current_status text;
begin
  select status into current_status from public.newsletter_subscribers where token = p_token for update;
  if not found or current_status = 'unsubscribed' then
    return 'invalid';
  end if;
  if current_status = 'subscribed' then
    return 'already_confirmed';
  end if;
  update public.newsletter_subscribers
     set status = 'subscribed', confirmed_at = now()
   where token = p_token;
  return 'confirmed';
end;
$$;

-- Returns 'unsubscribed' (also when already unsubscribed) or 'invalid'.
create or replace function public.gi_newsletter_unsubscribe(p_token uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
  update public.newsletter_subscribers
     set status = 'unsubscribed',
         unsubscribed_at = coalesce(unsubscribed_at, now())
   where token = p_token;
  if not found then
    return 'invalid';
  end if;
  return 'unsubscribed';
end;
$$;

revoke all on function
  public.gi_rate_limit_hit(text, text, integer),
  public.gi_sign_petition(text, text, text, text, boolean, text),
  public.gi_petition_counts(text[]),
  public.gi_add_volunteer(text, text, text, text[], text[], text, text),
  public.gi_add_contact_message(text, text, text, text),
  public.gi_add_rsvp(text, text, text, integer),
  public.gi_newsletter_request(text, text, text),
  public.gi_newsletter_send_failed(uuid),
  public.gi_newsletter_confirm(uuid),
  public.gi_newsletter_unsubscribe(uuid)
from public, anon, authenticated;

grant execute on function
  public.gi_rate_limit_hit(text, text, integer),
  public.gi_sign_petition(text, text, text, text, boolean, text),
  public.gi_petition_counts(text[]),
  public.gi_add_volunteer(text, text, text, text[], text[], text, text),
  public.gi_add_contact_message(text, text, text, text),
  public.gi_add_rsvp(text, text, text, integer),
  public.gi_newsletter_request(text, text, text),
  public.gi_newsletter_send_failed(uuid),
  public.gi_newsletter_confirm(uuid),
  public.gi_newsletter_unsubscribe(uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Organizer export views (schema not exposed through the API)
-- Use them from the Supabase SQL Editor, e.g.
--   select * from reports.petition_signatures where petition_slug = 'my-petition';
-- then "Download CSV".
-- ---------------------------------------------------------------------------

create schema if not exists reports;
revoke all on schema reports from public, anon, authenticated;

create or replace view reports.petition_signatures with (security_invoker = true) as
  select petition_slug, full_name, email, zip_code, newsletter_opt_in, created_at
    from public.petition_signatures
   where status = 'valid'
   order by petition_slug, created_at;

create or replace view reports.petition_totals with (security_invoker = true) as
  select petition_slug, count(*) as signatures, min(created_at) as first_signature, max(created_at) as latest_signature
    from public.petition_signatures
   where status = 'valid'
   group by petition_slug;

create or replace view reports.newsletter_confirmed with (security_invoker = true) as
  select email, confirmed_at, source,
         'https://getinvolvedvan.com/newsletter/unsubscribe/?token=' || token as unsubscribe_url
    from public.newsletter_subscribers
   where status = 'subscribed'
   order by confirmed_at;

create or replace view reports.volunteers with (security_invoker = true) as
  select full_name, email, phone, array_to_string(interests, ', ') as interests,
         array_to_string(availability, ', ') as availability, comments, status, created_at
    from public.volunteer_signups
   order by created_at desc;

create or replace view reports.contact_inbox with (security_invoker = true) as
  select created_at, name, email, subject, message, status
    from public.contact_messages
   order by created_at desc;

create or replace view reports.event_rsvps with (security_invoker = true) as
  select event_slug, full_name, email, party_size, created_at
    from public.event_rsvps
   where status = 'going'
   order by event_slug, created_at;

revoke all on all tables in schema reports from public, anon, authenticated;
