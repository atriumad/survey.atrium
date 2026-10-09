-- 0014: Record that a visitor clicked "Leave a Google review".
--
-- The survey used to set shared_to_google at submit time (the visitor answered
-- "yes, share"). That question is gone: the Google ask now happens on the final
-- screen, so the flag is set when the visitor clicks the Google button.
-- Only good (rating >= 4) reviews can be flagged; nothing else is writable.

-- The review uuid (shown only to the reviewer, in their final-page URL) acts as the
-- capability. The function only flips one boolean on good, rating >= 4 rows.
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

-- The old thank-you page copied a visitor's comment through this function, gated on
-- shared_to_google. The page no longer uses it, and together with mark_review_shared
-- it would let anyone holding a review id read comments of reviews whose authors
-- declined to share them. Remove it.
drop function if exists public.get_review_share_comment(uuid);
