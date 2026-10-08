-- 0010: Public location lookup via RPC.
--
-- The public survey and thank-you pages only need a location's id, name and
-- Google review link. Expose exactly that through a SECURITY DEFINER function
-- so the wide-open anon SELECT policies can be dropped (migration 0011).
-- Additive and safe to apply before the matching app deploy.

create or replace function get_public_location(p_slug text)
returns table (id uuid, name text, google_review_url text)
language sql
security definer
stable
set search_path = ''
as $$
  select l.id, l.name, l.google_review_url
  from public.locations l
  where l.slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_location(text) from public;
grant execute on function public.get_public_location(text) to anon, authenticated;
