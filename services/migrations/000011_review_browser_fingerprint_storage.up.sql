ALTER TABLE professor.review
    ADD COLUMN IF NOT EXISTS browser_fingerprint jsonb,
    ADD COLUMN IF NOT EXISTS thumbmark_fingerprint text,
    ADD COLUMN IF NOT EXISTS creep_fingerprint text;
