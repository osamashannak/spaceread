-- Migration 15 was already applied in some environments before all of its
-- matching indexes were added. Fill those gaps without duplicating indexes in
-- databases which received the final version of migration 15. The v2 names
-- make this migration's indexes safe to remove independently on rollback.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $migration$
BEGIN
    IF to_regclass('professor.professor_request_lower_email_index') IS NULL THEN
        CREATE INDEX IF NOT EXISTS professor_request_lower_email_v2_index
            ON professor.professor_request (lower(professor_email))
            WHERE professor_email IS NOT NULL;
    END IF;

    IF to_regclass('professor.professor_request_normalized_university_name_index') IS NULL THEN
        CREATE INDEX IF NOT EXISTS professor_request_normalized_university_name_v2_index
            ON professor.professor_request (
                lower(regexp_replace(btrim(university), '\s+', ' ', 'g')),
                lower(regexp_replace(btrim(professor_name), '\s+', ' ', 'g'))
            );
    END IF;

    IF to_regclass('professor.professor_lower_email_index') IS NULL THEN
        CREATE INDEX IF NOT EXISTS professor_lower_email_v2_index
            ON professor.professor (lower(email));
    END IF;

    IF to_regclass('professor.professor_normalized_university_name_index') IS NULL THEN
        CREATE INDEX IF NOT EXISTS professor_normalized_university_name_v2_index
            ON professor.professor (
                lower(regexp_replace(btrim(university), '\s+', ' ', 'g')),
                lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
            );
    END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS professor_lower_name_gist_v2_index
    ON professor.professor USING gist (lower(name) gist_trgm_ops(siglen=64));

CREATE INDEX IF NOT EXISTS professor_university_name_gist_v2_index
    ON professor.professor USING gist (
        (lower(regexp_replace(btrim(university), '\s+', ' ', 'g'))) gist_text_ops,
        (lower(name)) gist_trgm_ops(siglen=64)
    );
