-- Views and downloads were only kept as running totals, so they had no history.
-- These triggers record every increase per UAE-local day, without touching the
-- code that bumps the counters.
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.daily_count (
    day date NOT NULL,
    kind text NOT NULL,
    target text NOT NULL,
    count bigint DEFAULT 0 NOT NULL,
    PRIMARY KEY (day, kind, target),
    CONSTRAINT daily_count_kind_check
        CHECK (kind IN ('professor_view', 'course_view', 'file_download'))
);

CREATE INDEX IF NOT EXISTS daily_count_kind_target_day_index
    ON analytics.daily_count (kind, target, day DESC);

-- Admin operations that move totals between rows (like merging professors)
-- set analytics.skip_daily_count = 'on' for their transaction so the moved
-- totals are not counted as new views.
CREATE OR REPLACE FUNCTION analytics.record_daily_count(p_kind text, p_target text, p_amount bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_setting('analytics.skip_daily_count', true) = 'on' THEN
        RETURN;
    END IF;

    INSERT INTO analytics.daily_count (day, kind, target, count)
    VALUES ((now() AT TIME ZONE 'Asia/Dubai')::date, p_kind, p_target, p_amount)
    ON CONFLICT (day, kind, target)
    DO UPDATE SET count = analytics.daily_count.count + EXCLUDED.count;
END;
$$;

CREATE OR REPLACE FUNCTION analytics.trg_professor_views()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM analytics.record_daily_count('professor_view', NEW.email, NEW.views - OLD.views);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION analytics.trg_course_views()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM analytics.record_daily_count('course_view', NEW.tag, NEW.views - OLD.views);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION analytics.trg_file_downloads()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM analytics.record_daily_count('file_download', NEW.id::text, NEW.download_count - OLD.download_count);
    RETURN NEW;
END;
$$;

CREATE TRIGGER professor_views_daily_count
    AFTER UPDATE OF views ON professor.professor
    FOR EACH ROW WHEN (NEW.views > OLD.views)
    EXECUTE FUNCTION analytics.trg_professor_views();

CREATE TRIGGER course_views_daily_count
    AFTER UPDATE OF views ON course.course
    FOR EACH ROW WHEN (NEW.views > OLD.views)
    EXECUTE FUNCTION analytics.trg_course_views();

CREATE TRIGGER file_downloads_daily_count
    AFTER UPDATE OF download_count ON course.file
    FOR EACH ROW WHEN (NEW.download_count > OLD.download_count)
    EXECUTE FUNCTION analytics.trg_file_downloads();
