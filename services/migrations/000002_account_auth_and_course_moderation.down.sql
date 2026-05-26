DROP INDEX IF EXISTS professor.reply_like_user_reply_unique;
DROP INDEX IF EXISTS professor.review_rating_user_review_unique;
DROP INDEX IF EXISTS course.course_file_review_queue_index;
DROP INDEX IF EXISTS account.account_user_primary_email_lower_unique;
DROP INDEX IF EXISTS account.account_user_username_lower_unique;
DROP INDEX IF EXISTS account.account_login_session_token_hash_active_index;
DROP INDEX IF EXISTS account.account_login_session_user_id_index;

ALTER TABLE course.file
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS session_id,
    DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.feedback
    DROP COLUMN IF EXISTS user_id;

ALTER TABLE account.session
    DROP CONSTRAINT IF EXISTS session_user_id_fkey;

DROP TABLE IF EXISTS account.login_session;
DROP TABLE IF EXISTS account.identity;
DROP TABLE IF EXISTS account."user";
