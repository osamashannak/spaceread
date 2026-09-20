BEGIN;

LOCK TABLE professor.review_reply, professor.review IN SHARE ROW EXCLUSIVE MODE;

-- Restore the previous trigger behavior. Repaired counts are retained.
CREATE OR REPLACE FUNCTION public.update_review_reply_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE professor.review
        SET reply_count = reply_count + 1
        WHERE id = NEW.review_id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (OLD.deleted_at IS NULL AND OLD.visible)
            AND NOT (NEW.deleted_at IS NULL AND NEW.visible) THEN
            UPDATE professor.review
            SET reply_count = reply_count - 1
            WHERE id = NEW.review_id;
        ELSIF NOT (OLD.deleted_at IS NULL AND OLD.visible)
            AND (NEW.deleted_at IS NULL AND NEW.visible) THEN
            UPDATE professor.review
            SET reply_count = reply_count + 1
            WHERE id = NEW.review_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER review_reply_count_trigger
AFTER INSERT OR UPDATE ON professor.review_reply
FOR EACH ROW EXECUTE FUNCTION public.update_review_reply_count();

COMMIT;
