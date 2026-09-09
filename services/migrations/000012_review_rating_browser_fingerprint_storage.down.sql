ALTER TABLE professor.review_rating
    DROP COLUMN IF EXISTS creep_fingerprint,
    DROP COLUMN IF EXISTS thumbmark_fingerprint,
    DROP COLUMN IF EXISTS browser_fingerprint;
