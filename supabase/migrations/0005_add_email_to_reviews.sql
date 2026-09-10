alter table reviews add column email text;

create index reviews_email_idx on reviews (email);