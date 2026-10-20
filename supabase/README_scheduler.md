# Supabase scheduler (pg_cron + pg_net) — apply via the Dashboard SQL editor

## 0. Check egress first (no secrets needed)
Run in SQL editor:
```sql
create extension if not exists pg_net with schema extensions;
select net.http_get('https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69?format=json&limit=1') as request_id;
-- wait ~10 s, then:
select id, status_code, error_msg, left(content, 200) from net._http_response order by id desc limit 1;
```
Reachable = status_code 401/403/400 (key missing) or 200. `error_msg` like
"Couldn't connect"/"Timeout" = data.gov.in blocks Supabase too; stop here.

## 1. Vault secrets (Project Settings -> Vault -> New secret)
| name | value |
|---|---|
| `vayu_datagov_api_key` | data.gov.in key (user types it) |
| `vayu_admin_token` | one of Render's `VAYU_ADMIN_TOKENS` |
| `vayu_api_base` | `https://vayu-api-staging.onrender.com` |

## 2. Migration
Paste `supabase/migrations/20261020_vayu_scheduler.sql` and run.

## 3. Test once
```sql
select public.vayu_cpcb_request();
-- ~15 s later
select public.vayu_cpcb_collect();
select id, status_code, error, jsonb_array_length(body->'records') from cpcb_datagov_raw order by id desc limit 3;
select public.vayu_trigger_refresh();
select jobname, schedule from cron.job where jobname like 'vayu-%';
```
The API parses unparsed rows on refresh (`parsed_at` gets set); /api/v2/health
then shows `cpcb` fresh.

## Undo
```sql
select cron.unschedule(j) from unnest(array['vayu-cpcb-request','vayu-cpcb-collect','vayu-refresh','vayu-cpcb-prune']) j;
```
