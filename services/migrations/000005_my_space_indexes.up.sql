CREATE INDEX IF NOT EXISTS course_file_user_created_at_index
    ON course.file (user_id, created_at DESC);
