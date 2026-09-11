-- 0007: Database-backed rate limiting + location slug uniqueness.
--
-- The public survey and the login endpoint are rate-limited per IP using this
-- table. It is deliberately unreachable from anon/authenticated: the only
-- access is through the SECURITY DEFINER consume_rate_limit() function.

create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);

alter table rate_limits enable row level security;

-- No policies: rows are only ever touched by consume_rate_limit().
-- Tables with RLS enabled and no policies reject all non-owner access.

create or replace function consume_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_attempts integer;
begin
  loop
    select window_start, attempts into v_window_start, v_attempts
    from public.rate_limits
    where key = p_key
    for update;

    if not found then
      insert into public.rate_limits (key, window_start, attempts)
      values (p_key, now(), 1)
      on conflict (key) do nothing
      returning window_start, attempts into v_window_start, v_attempts;
      exit when found;
    else
      if now() >= v_window_start + make_interval(secs => p_window_seconds) then
        update public.rate_limits
        set window_start = now(), attempts = 1
        where key = p_key;
        v_attempts := 1;
      elsif v_attempts >= p_max_attempts then
        return false;
      else
        update public.rate_limits
        set attempts = attempts + 1
        where key = p_key;
        v_attempts := v_attempts + 1;
      end if;
      exit;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to anon, authenticated;

-- submit_review resolves locations by slug with limit 1; duplicate slugs would
-- silently pick an arbitrary row. Locations are already unique per client, but
-- the safe public lookup requires a global uniqueness guarantee.
create unique index locations_slug_key on locations (slug);