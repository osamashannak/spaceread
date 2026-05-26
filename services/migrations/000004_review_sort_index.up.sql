CREATE INDEX IF NOT EXISTS review_professor_sort_index
    ON professor.review (professor_email, sort_index DESC)
    WHERE deleted_at IS NULL;
