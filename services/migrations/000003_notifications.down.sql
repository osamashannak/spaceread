DROP INDEX IF EXISTS account.account_notification_review_id_index;
DROP INDEX IF EXISTS account.account_notification_session_unread_index;
DROP INDEX IF EXISTS account.account_notification_session_created_at_index;
DROP INDEX IF EXISTS account.account_notification_user_unread_index;
DROP INDEX IF EXISTS account.account_notification_user_created_at_index;

DROP TABLE IF EXISTS account.notification;
