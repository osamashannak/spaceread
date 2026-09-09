CREATE INDEX IF NOT EXISTS review_rating_review_ip_address_index
    ON professor.review_rating (review_id, ip_address, session_id);

CREATE INDEX IF NOT EXISTS review_rating_review_thumbmark_index
    ON professor.review_rating (review_id, thumbmark_fingerprint, session_id)
    WHERE thumbmark_fingerprint IS NOT NULL AND thumbmark_fingerprint <> '';

CREATE INDEX IF NOT EXISTS review_rating_review_creep_index
    ON professor.review_rating (review_id, creep_fingerprint, session_id)
    WHERE creep_fingerprint IS NOT NULL AND creep_fingerprint <> '';
