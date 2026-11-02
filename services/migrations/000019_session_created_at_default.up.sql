-- Session inserts never set created_at, so new visitor sessions stopped
-- being dated. Default it so admin statistics can chart new sessions.
ALTER TABLE account.session
    ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');

CREATE INDEX IF NOT EXISTS account_session_created_at_index
    ON account.session (created_at)
    WHERE created_at IS NOT NULL;

-- Admin statistics scan votes by date.
CREATE INDEX IF NOT EXISTS review_rating_created_at_index
    ON professor.review_rating (created_at);
