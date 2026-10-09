-- 0014: Record that a visitor clicked "Leave a Google review".
--
-- The survey used to set shared_to_google at submit time (the visitor answered
-- "yes, share"). That question is gone: the Google ask now happens on the final
-- screen, so the flag is set when the visitor clicks the Google button.
-- Only good (rating >= 4) reviews can be flagged; nothing else is writable.

create or replace function public.mark_review_shared(p_review_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reviews
  set shared_to_google = true
  where id = p_review_id
    and classification = 'good'
    and rating >= 4
    and shared_to_google = false;
$$;

revoke all on function public.mark_review_shared(uuid) from public;
grant execute on function public.mark_review_shared(uuid) to anon, authenticated;
