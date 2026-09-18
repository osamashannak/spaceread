ALTER TABLE professor.professor_request
    ADD COLUMN IF NOT EXISTS resolved_professor_email text
        REFERENCES professor.professor(email) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS professor_request_resolved_professor_email_index
    ON professor.professor_request (resolved_professor_email)
    WHERE resolved_professor_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS professor_request_search_trgm_index
    ON professor.professor_request USING gin (
        (professor_name || ' ' || COALESCE(professor_email, '') || ' ' || university || ' ' || COALESCE(college, '')) gin_trgm_ops
    );

CREATE INDEX IF NOT EXISTS professor_request_lower_email_index
    ON professor.professor_request (lower(professor_email))
    WHERE professor_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS professor_request_normalized_university_name_index
    ON professor.professor_request (
        lower(regexp_replace(btrim(university), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(professor_name), '\s+', ' ', 'g'))
    );

CREATE INDEX IF NOT EXISTS professor_name_trgm_index
    ON professor.professor USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS professor_lower_email_index
    ON professor.professor (lower(email));

CREATE INDEX IF NOT EXISTS professor_normalized_university_name_index
    ON professor.professor (
        lower(regexp_replace(btrim(university), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
    );
