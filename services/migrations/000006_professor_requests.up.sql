CREATE TABLE IF NOT EXISTS professor.professor_request (
    id bigint PRIMARY KEY,
    professor_name text NOT NULL,
    professor_email text,
    university text NOT NULL,
    college text,
    status text DEFAULT 'pending' NOT NULL,
    session_id bigint NOT NULL,
    user_id bigint REFERENCES account."user"(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewer_user_id bigint REFERENCES account."user"(id) ON DELETE SET NULL,
    CONSTRAINT professor_request_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS professor_request_status_created_at_index
    ON professor.professor_request (status, created_at DESC);

CREATE INDEX IF NOT EXISTS professor_request_university_created_at_index
    ON professor.professor_request (university, created_at DESC);
