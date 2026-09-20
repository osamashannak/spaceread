BEGIN;

-- Keep reply writes out of the trigger replacement and count repair.
LOCK TABLE professor.review_reply, professor.review IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.update_review_reply_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    old_review_id bigint;
    new_review_id bigint;
BEGIN
    -- Match the public reply list: only visible, non-deleted replies count.
    IF TG_OP <> 'INSERT' THEN
        IF OLD.visible AND OLD.deleted_at IS NULL THEN
            old_review_id := OLD.review_id;
        END IF;
    END IF;

    IF TG_OP <> 'DELETE' THEN
        IF NEW.visible AND NEW.deleted_at IS NULL THEN
            new_review_id := NEW.review_id;
        END IF;
    END IF;

    IF old_review_id IS NOT DISTINCT FROM new_review_id THEN
        RETURN NULL;
    END IF;

    -- Lock parents in a stable order when a reply moves between reviews.
    -- Atomic deltas preserve counts when multiple replies change concurrently.
    PERFORM id
    FROM professor.review
    WHERE id IN (old_review_id, new_review_id)
    ORDER BY id
    FOR NO KEY UPDATE;

    UPDATE professor.review
    SET reply_count = reply_count + CASE WHEN id = new_review_id THEN 1 ELSE -1 END
    WHERE id IN (old_review_id, new_review_id);

    RETURN NULL; -- This is an AFTER trigger; its return value is ignored.
END;
$$;

CREATE OR REPLACE TRIGGER review_reply_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON professor.review_reply
FOR EACH ROW EXECUTE FUNCTION public.update_review_reply_count();

-- Repair existing drift, including reviews that no longer have any replies.
WITH counts AS (
    SELECT r.id, count(rr.id) AS reply_count
    FROM professor.review r
    LEFT JOIN professor.review_reply rr
        ON rr.review_id = r.id AND rr.visible AND rr.deleted_at IS NULL
    GROUP BY r.id
)
UPDATE professor.review r
SET reply_count = counts.reply_count
FROM counts
WHERE r.id = counts.id AND r.reply_count IS DISTINCT FROM counts.reply_count;

COMMIT;
