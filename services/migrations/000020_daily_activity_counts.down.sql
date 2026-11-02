DROP TRIGGER IF EXISTS file_downloads_daily_count ON course.file;
DROP TRIGGER IF EXISTS course_views_daily_count ON course.course;
DROP TRIGGER IF EXISTS professor_views_daily_count ON professor.professor;

DROP FUNCTION IF EXISTS analytics.trg_file_downloads();
DROP FUNCTION IF EXISTS analytics.trg_course_views();
DROP FUNCTION IF EXISTS analytics.trg_professor_views();
DROP FUNCTION IF EXISTS analytics.record_daily_count(text, text, bigint);

DROP TABLE IF EXISTS analytics.daily_count;
DROP SCHEMA IF EXISTS analytics;
