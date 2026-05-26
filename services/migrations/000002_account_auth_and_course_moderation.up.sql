CREATE TABLE IF NOT EXISTS account."user" (
    id bigint PRIMARY KEY,
    username text NOT NULL,
    primary_email text NOT NULL,
    role text DEFAULT 'user' NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS account.identity (
    id bigint PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES account."user"(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    email text NOT NULL,
    password_hash text,
    email_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (provider, provider_subject),
    UNIQUE (provider, email)
);

CREATE TABLE IF NOT EXISTS account.login_session (
    id bigint PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES account."user"(id) ON DELETE CASCADE,
    session_id bigint NOT NULL REFERENCES account.session(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    user_agent text,
    ip_address inet
);

ALTER TABLE account.session
    ADD CONSTRAINT session_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES account."user"(id) ON DELETE SET NULL;

ALTER TABLE public.feedback
    ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES account."user"(id) ON DELETE SET NULL;

ALTER TABLE course.file
    ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES account."user"(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS session_id bigint REFERENCES account.session(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS account_login_session_user_id_index
    ON account.login_session (user_id);

CREATE INDEX IF NOT EXISTS account_login_session_token_hash_active_index
    ON account.login_session (token_hash)
    WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS account_user_username_lower_unique
    ON account."user" (lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS account_user_primary_email_lower_unique
    ON account."user" (lower(primary_email));

CREATE INDEX IF NOT EXISTS course_file_review_queue_index
    ON course.file (reviewed, visible, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS review_rating_user_review_unique
    ON professor.review_rating (review_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reply_like_user_reply_unique
    ON professor.reply_like (reply_id, user_id)
    WHERE user_id IS NOT NULL;
