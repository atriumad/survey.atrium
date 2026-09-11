-- 0006: Harden the write path.
--
-- Replaces the wide-open public INSERT policies with SECURITY DEFINER RPCs so
-- anonymous/authenticated callers can no longer write arbitrary rows (or fake
-- client_id). Also hardens auth_profile() with a locked search_path.

-- 1) Drop the wide-open insert policies.
drop policy if exists "anon can insert reviews" on reviews;
drop policy if exists "authenticated can insert reviews" on reviews;
drop policy if exists "anon can insert qr scans" on qr_scans;

-- 2) Harden auth_profile to a locked search_path (prevent search_path hijack).
create or replace function auth_profile()
returns table (client_id uuid, role text, location_id uuid)
language sql
security definer
set search_path = ''
stable
as $$
  select client_id, role, location_id from public.profiles where id = auth.uid();
$$;

-- 3) submit_review: the only way the public can write a review.
-- Recomputes classification on the server so a client can't tamper with it.
create or replace function submit_review(
  p_location_slug text,
  p_rating smallint,
  p_comment text,
  p_email text,
  p_requested_google boolean
)
returns table (review_id uuid, classification text, shared_to_google boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
  v_client_id uuid;
  v_matched text[];
  v_classification text;
  v_good boolean;
begin
  select id, client_id into v_location_id, v_client_id
  from public.locations
  where slug = p_location_slug
  limit 1;

  if v_location_id is null then
    raise exception 'LOCATION_NOT_FOUND';
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'INVALID_RATING';
  end if;

  if p_comment is null or char_length(p_comment) > 1000 then
    raise exception 'INVALID_COMMENT';
  end if;

  -- Mirror server-side validation: comment required for ratings of 3 or below.
  if p_rating <= 3 and (p_comment is null or length(btrim(p_comment)) = 0) then
    raise exception 'COMMENT_REQUIRED';
  end if;

  if p_email is null or p_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;
  if char_length(p_email) > 254 then
    raise exception 'EMAIL_TOO_LONG';
  end if;

  select coalesce(array_agg(k.keyword), '{}')
  into v_matched
  from public.negative_keywords k
  where k.client_id = v_client_id
    and lower(p_comment) like '%' || lower(k.keyword) || '%';

  v_good := p_rating >= 4 and coalesce(array_length(v_matched, 1), 0) = 0;
  v_classification := case when v_good then 'good' else 'bad' end;

  insert into public.reviews
    (client_id, location_id, rating, comment, email, classification, matched_keywords, shared_to_google)
  values
    (v_client_id, v_location_id, p_rating, nullif(p_comment, ''), p_email,
     v_classification,
     case when array_length(v_matched, 1) = 0 then null else v_matched end,
     v_good and coalesce(p_requested_google, false))
  returning id into review_id;

  classification := v_classification;
  shared_to_google := v_good and coalesce(p_requested_google, false);
  return next;
end;
$$;

-- 4) record_qr_scan: derives client from the location so callers can't
-- fabricate client_id.
create or replace function record_qr_scan(p_location_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.qr_scans (client_id, location_id)
  select client_id, id from public.locations where id = p_location_id;
$$;

-- 5) get_review_share_comment: only exposes the comment when the reviewer
-- opted in to sharing it on Google.
create or replace function get_review_share_comment(p_review_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select comment from public.reviews where id = p_review_id and shared_to_google = true;
$$;

-- 6) Lock down direct table writes.
revoke insert, update, delete on reviews from anon, authenticated;
revoke insert, update, delete on qr_scans from anon, authenticated;

-- 7) Function grants: only EXECUTE, nothing else, from nothing public.
revoke all on function public.auth_profile() from public;
revoke all on function public.submit_review(text, smallint, text, text, boolean) from public;
revoke all on function public.record_qr_scan(uuid) from public;
revoke all on function public.get_review_share_comment(uuid) from public;
grant execute on function public.auth_profile() to anon, authenticated;
grant execute on function public.submit_review(text, smallint, text, text, boolean) to anon, authenticated;
grant execute on function public.record_qr_scan(uuid) to anon, authenticated;
grant execute on function public.get_review_share_comment(uuid) to anon, authenticated;