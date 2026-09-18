ALTER TABLE moderation.action_log
    DROP CONSTRAINT moderation_action_log_target_type_check,
    ADD CONSTRAINT moderation_action_log_target_type_check
        CHECK (target_type IN (
            'professor_review',
            'review_reply',
            'review_attachment',
            'review_report',
            'review_rating',
            'course_file',
            'professor_request',
            'professor'
        ));

ALTER TABLE moderation.action_log
    DROP CONSTRAINT moderation_action_log_action_check,
    ADD CONSTRAINT moderation_action_log_action_check
        CHECK (action IN (
            'approve',
            'reject',
            'hide',
            'restore',
            'dismiss',
            'resolve',
            'mark_duplicate',
            'note',
            'delete'
        ));
