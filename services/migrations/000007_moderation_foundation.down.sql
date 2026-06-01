DROP INDEX IF EXISTS professor.review_report_open_created_at_index;
DROP INDEX IF EXISTS professor.review_reply_moderation_queue_index;
DROP INDEX IF EXISTS professor.review_moderation_queue_index;
DROP INDEX IF EXISTS moderation.moderation_signal_target_created_at_index;
DROP INDEX IF EXISTS moderation.moderation_action_log_target_created_at_index;

ALTER TABLE professor.review_report
    DROP COLUMN IF EXISTS resolution_note,
    DROP COLUMN IF EXISTS resolution_reason_code,
    DROP COLUMN IF EXISTS resolution_action,
    DROP COLUMN IF EXISTS resolver_user_id,
    DROP COLUMN IF EXISTS resolved_at,
    DROP COLUMN IF EXISTS user_id;

ALTER TABLE professor.professor
    DROP COLUMN IF EXISTS moderation_note,
    DROP COLUMN IF EXISTS moderation_reason_code,
    DROP COLUMN IF EXISTS moderator_user_id,
    DROP COLUMN IF EXISTS moderated_at;

ALTER TABLE professor.professor_request
    DROP COLUMN IF EXISTS moderation_note,
    DROP COLUMN IF EXISTS moderation_reason_code;

ALTER TABLE course.file
    DROP COLUMN IF EXISTS moderation_note,
    DROP COLUMN IF EXISTS moderation_reason_code,
    DROP COLUMN IF EXISTS reviewer_user_id;

ALTER TABLE professor.review_attachment
    DROP COLUMN IF EXISTS moderation_note,
    DROP COLUMN IF EXISTS moderation_reason_code,
    DROP COLUMN IF EXISTS reviewer_user_id,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed;

ALTER TABLE professor.review_reply
    DROP COLUMN IF EXISTS moderation_note,
    DROP COLUMN IF EXISTS moderation_reason_code,
    DROP COLUMN IF EXISTS reviewer_user_id,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed;

ALTER TABLE professor.review
    DROP COLUMN IF EXISTS moderation_note,
    DROP COLUMN IF EXISTS moderation_reason_code,
    DROP COLUMN IF EXISTS reviewer_user_id,
    DROP COLUMN IF EXISTS reviewed_at;

DROP TABLE IF EXISTS moderation.signal;
DROP TABLE IF EXISTS moderation.action_log;
DROP TABLE IF EXISTS moderation.reason;
DROP SCHEMA IF EXISTS moderation;
