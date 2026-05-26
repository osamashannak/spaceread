CREATE TABLE IF NOT EXISTS account.notification (
    id bigint PRIMARY KEY,
    user_id bigint REFERENCES account."user"(id) ON DELETE CASCADE,
    session_id bigint REFERENCES account.session(id) ON DELETE CASCADE,
    actor_user_id bigint REFERENCES account."user"(id) ON DELETE SET NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    href text NOT NULL,
    review_id bigint REFERENCES professor.review(id) ON DELETE CASCADE,
    reply_id bigint REFERENCES professor.review_reply(id) ON DELETE CASCADE,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_notification_target_check
        CHECK (user_id IS NOT NULL OR session_id IS NOT NULL),
    CONSTRAINT account_notification_type_check
        CHECK (type IN ('review_reply', 'reply_mention'))
);

CREATE INDEX IF NOT EXISTS account_notification_user_created_at_index
    ON account.notification (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_notification_user_unread_index
    ON account.notification (user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS account_notification_session_created_at_index
    ON account.notification (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_notification_session_unread_index
    ON account.notification (session_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS account_notification_review_id_index
    ON account.notification (review_id);
