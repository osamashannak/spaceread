INSERT INTO professor.reply_name (review_id, session_id, user_id, name)
VALUES
    (400003, 300001, 100001, 'Blue Falcon')
ON CONFLICT (review_id, session_id) DO NOTHING;

INSERT INTO professor.review_reply (id, content, gif, visible, session_id, user_id, review_id, mention_id, created_at, op)
VALUES
    (500004, 'Yeah, that deadline week was rough.', NULL, true, 300001, 100001, 400003, 500003, now() - interval '1 day', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO account.notification (
    id,
    user_id,
    session_id,
    actor_user_id,
    type,
    title,
    body,
    href,
    review_id,
    reply_id,
    read_at,
    created_at
)
VALUES
    (
        900001,
        100001,
        300001,
        100002,
        'review_reply',
        'New reply on your review',
        'Silver Palm replied to your review.',
        '/professor/maya.hassan@example.edu#400001',
        400001,
        500001,
        NULL,
        now() - interval '7 days'
    ),
    (
        900002,
        100002,
        300002,
        100001,
        'reply_mention',
        'New reply to your comment',
        'Blue Falcon replied to you.',
        '/professor/maya.hassan@example.edu#400001',
        400001,
        500002,
        now() - interval '5 days',
        now() - interval '6 days'
    ),
    (
        900003,
        NULL,
        300003,
        100001,
        'reply_mention',
        'New reply to your comment',
        'Blue Falcon replied to you.',
        '/professor/omar.alnuaimi@example.edu#400003',
        400003,
        500004,
        NULL,
        now() - interval '1 day'
    )
ON CONFLICT (id) DO NOTHING;
