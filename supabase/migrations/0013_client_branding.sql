-- 0013: Client branding for the public survey page.
--
-- 1) Public Storage bucket for client logos. Reads are public by URL; there are
--    no policies on storage.objects, so anon cannot list or write. Uploads go
--    through the service role from the superadmin panel.
-- 2) get_public_location also returns the client's name and logo URL.
--    The return type changes, so the function must be dropped and recreated.
--    Apply BEFORE deploying the app version that reads the new columns.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-logos', 'client-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop function if exists public.get_public_location(text);

create function public.get_public_location(p_slug text)
returns table (id uuid, name text, google_review_url text, client_name text, client_logo_url text)
language sql
security definer
stable
set search_path = ''
as $$
  select l.id, l.name, l.google_review_url, c.name, c.logo_url
  from public.locations l
  join public.clients c on c.id = l.client_id
  where l.slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_location(text) from public;
grant execute on function public.get_public_location(text) to anon, authenticated;
