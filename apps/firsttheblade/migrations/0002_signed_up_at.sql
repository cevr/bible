-- When an address last signed up while it was not confirmed: a sign-up still
-- pending 30 days after it is undone (src/mail/list.ts, purge). An address
-- already on the list takes the latest time it is known to have signed up:
-- its first sign-up, its newest confirm email, or its leaving.

ALTER TABLE subscribers ADD COLUMN signed_up_at INTEGER NOT NULL DEFAULT 0;

UPDATE subscribers
SET signed_up_at = max(created_at, coalesce(confirm_sent_at, 0), coalesce(unsubscribed_at, 0));
