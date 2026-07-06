CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS review_content_trgm_index
    ON professor.review USING gin (content gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS review_ip_address_index
    ON professor.review (ip_address)
    WHERE deleted_at IS NULL AND ip_address IS NOT NULL;
