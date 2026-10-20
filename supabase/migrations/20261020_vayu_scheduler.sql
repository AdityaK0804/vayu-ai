-- Vayu: in-database scheduler on Supabase (Mumbai) using pg_cron + pg_net.
--
-- Why here: api.data.gov.in is not reachable from Render (Singapore) and
-- GitHub runners; Supabase ap-south-1 sits in India. pg_net is asynchronous,
-- so the CPCB fetch is split into "request" (:05) and "collect" (:08); the
-- backend parses collected rows during its refresh (:12).
--
-- NO SECRET VALUES IN THIS FILE. Create these Vault secrets first
-- (Dashboard -> Project Settings -> Vault, or vault.create_secret):
--   vayu_datagov_api_key   data.gov.in API key            (user enters)
--   vayu_admin_token       one of Render's VAYU_ADMIN_TOKENS
--   vayu_api_base          https://vayu-api-staging.onrender.com
-- Safe to re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Non-secret source settings (edit here, not in code).
create table if not exists public.vayu_source_config (
    key   text primary key,
    value text not null
);
insert into public.vayu_source_config(key, value) values
    ('cpcb_datagov_url', 'https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69'),
    ('cpcb_state', 'Chhattisgarh'),
    ('cpcb_page_size', '500'),
    ('user_agent', 'vayu-ai/1.0 (+https://github.com/AdityaK0804/vayu-ai)')
on conflict (key) do nothing;

-- Raw CPCB responses as fetched (provenance: url, time, status, body hash).
create table if not exists public.cpcb_datagov_raw (
    id           bigserial primary key,
    request_id   bigint unique,
    requested_at timestamptz not null default now(),
    fetched_at   timestamptz,
    url          text not null,           -- without the api-key
    status_code  integer,
    body         jsonb,
    body_md5     text,
    error        text,
    parsed_at    timestamptz,             -- set by the backend parser
    parse_note   text
);
create index if not exists cpcb_datagov_raw_unparsed
    on public.cpcb_datagov_raw (fetched_at) where parsed_at is null;

alter table public.cpcb_datagov_raw enable row level security;   -- no anon access
alter table public.vayu_source_config enable row level security;

-- 1) Fire the HTTP request (async). The key is read from Vault at call time.
create or replace function public.vayu_cpcb_request() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
    k   text;
    u   text := (select value from vayu_source_config where key = 'cpcb_datagov_url');
    st  text := (select value from vayu_source_config where key = 'cpcb_state');
    lim text := (select value from vayu_source_config where key = 'cpcb_page_size');
    ua  text := (select value from vayu_source_config where key = 'user_agent');
    rid bigint;
begin
    select decrypted_secret into k from vault.decrypted_secrets where name = 'vayu_datagov_api_key';
    if k is null then raise exception 'Vault secret vayu_datagov_api_key missing'; end if;
    select net.http_get(
        url := u,
        params := jsonb_build_object('api-key', k, 'format', 'json', 'limit', lim,
                                     'offset', '0', 'filters[state]', st),
        headers := jsonb_build_object('User-Agent', ua, 'Accept', 'application/json'),
        timeout_milliseconds := 60000
    ) into rid;
    insert into cpcb_datagov_raw(request_id, url) values (rid, u || '?filters[state]=' || st);
    return rid;
end $$;

-- 2) Copy finished pg_net responses into the raw table.
create or replace function public.vayu_cpcb_collect() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
    update cpcb_datagov_raw r set
        fetched_at  = coalesce(resp.created, now()),
        status_code = resp.status_code,
        body        = case when resp.status_code = 200 then resp.content::jsonb end,
        body_md5    = md5(coalesce(resp.content, '')),
        error       = coalesce(resp.error_msg,
                        case when resp.status_code <> 200 then left(resp.content, 300) end)
    from net._http_response resp
    where resp.id = r.request_id and r.fetched_at is null;
    get diagnostics n = row_count;
    -- requests pg_net already dropped (> 6 h): mark so they don't linger
    update cpcb_datagov_raw set fetched_at = now(), error = 'no response'
    where fetched_at is null and requested_at < now() - interval '6 hours';
    return n;
end $$;

-- 3) Ask the Render API to run its refresh (it parses the raw rows first).
create or replace function public.vayu_trigger_refresh() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare base text; tok text; rid bigint;
begin
    select decrypted_secret into base from vault.decrypted_secrets where name = 'vayu_api_base';
    select decrypted_secret into tok  from vault.decrypted_secrets where name = 'vayu_admin_token';
    if base is null or tok is null then raise exception 'Vault secrets vayu_api_base / vayu_admin_token missing'; end if;
    -- Fire-and-forget: the API keeps working after pg_net's timeout; Render's
    -- free instance may need ~1 min to wake, the refresh takes ~2 min.
    select net.http_post(
        url := rtrim(base, '/') || '/api/v2/admin/refresh',
        body := '{}'::jsonb,
        headers := jsonb_build_object('Authorization', 'Bearer ' || tok,
                                      'Content-Type', 'application/json'),
        timeout_milliseconds := 120000
    ) into rid;
    return rid;
end $$;

revoke all on function public.vayu_cpcb_request()   from public, anon, authenticated;
revoke all on function public.vayu_cpcb_collect()   from public, anon, authenticated;
revoke all on function public.vayu_trigger_refresh() from public, anon, authenticated;

-- Retention: keep 14 days of raw responses.
create or replace function public.vayu_cpcb_prune() returns integer
language sql security definer set search_path = public as $$
    with d as (delete from cpcb_datagov_raw where requested_at < now() - interval '14 days' returning 1)
    select count(*)::int from d $$;

-- Schedules (UTC). Re-running replaces them.
select cron.schedule('vayu-cpcb-request', '5 * * * *',  $$select public.vayu_cpcb_request()$$);
select cron.schedule('vayu-cpcb-collect', '8 * * * *',  $$select public.vayu_cpcb_collect()$$);
select cron.schedule('vayu-refresh',      '12 * * * *', $$select public.vayu_trigger_refresh()$$);
select cron.schedule('vayu-cpcb-prune',   '30 3 * * *', $$select public.vayu_cpcb_prune()$$);
