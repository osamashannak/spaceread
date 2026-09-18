DROP INDEX IF EXISTS professor.professor_normalized_university_name_index;
DROP INDEX IF EXISTS professor.professor_lower_email_index;
DROP INDEX IF EXISTS professor.professor_name_trgm_index;
DROP INDEX IF EXISTS professor.professor_request_normalized_university_name_index;
DROP INDEX IF EXISTS professor.professor_request_lower_email_index;
DROP INDEX IF EXISTS professor.professor_request_search_trgm_index;
DROP INDEX IF EXISTS professor.professor_request_resolved_professor_email_index;

ALTER TABLE professor.professor_request
    DROP COLUMN IF EXISTS resolved_professor_email;
