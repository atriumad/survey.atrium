-- Replace google_place_id (fragile place IDs that 404) with a direct review URL
-- the admin copies from Google Business Profile (https://g.page/r/XXXX/review).
alter table locations rename column google_place_id to google_review_url;

-- Drop any malformed values (incomplete place IDs are not valid URLs).
update locations set google_review_url = null
where google_review_url is not null
  and (google_review_url !~* '^https://' and google_review_url !~* '^http://');