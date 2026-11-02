DROP INDEX IF EXISTS professor.review_rating_created_at_index;
DROP INDEX IF EXISTS account.account_session_created_at_index;

ALTER TABLE account.session
    ALTER COLUMN created_at DROP DEFAULT;
