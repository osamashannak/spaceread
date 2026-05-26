INSERT INTO professor.review (
    id,
    sort_index,
    score,
    positive,
    content,
    professor_email,
    ip_address,
    session_id,
    user_id,
    visible,
    reviewed,
    uaeu_origin,
    language,
    created_at,
    grade_received,
    course_taken,
    student_verified
)
VALUES
    (400001, 400001, 5, true, 'Clear lectures, fair grading, and very responsive during office hours.', 'maya.hassan@example.edu', '127.0.0.1', 300001, 100001, true, true, true, 'en', now() - interval '8 days', 'A', 'COMP350', true),
    (400002, 400002, 4, true, 'Projects are demanding but the feedback is genuinely helpful.', 'maya.hassan@example.edu', '127.0.0.1', 300002, 100002, true, true, true, 'en', now() - interval '5 days', 'B+', 'COMP370', true),
    (400003, 400003, 3, false, 'The material is useful, but deadlines can feel compressed.', 'omar.alnuaimi@example.edu', '127.0.0.1', 300003, NULL, true, true, false, 'en', now() - interval '3 days', 'B', 'PHYS110', false),
    (400004, 400004, 5, true, 'Explains abstract topics with examples and keeps quizzes aligned with lectures.', 'lina.farooq@example.edu', '127.0.0.1', 300002, 100002, true, true, false, 'en', now() - interval '1 day', 'A-', 'MATH101', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO professor.review_rating (value, ip_address, review_id, session_id, user_id)
VALUES
    (true, '127.0.0.1', 400001, 300002, 100002),
    (true, '127.0.0.1', 400001, 300003, NULL),
    (false, '127.0.0.1', 400003, 300001, 100001),
    (true, '127.0.0.1', 400004, 300001, 100001)
ON CONFLICT (review_id, session_id) DO NOTHING;

INSERT INTO professor.review_reply (id, content, gif, visible, session_id, user_id, review_id, mention_id, created_at, op)
VALUES
    (500001, 'Agreed. The project rubric made expectations clear.', NULL, true, 300002, 100002, 400001, NULL, now() - interval '7 days', false),
    (500002, 'Office hours helped me a lot too.', NULL, true, 300001, 100001, 400001, 500001, now() - interval '6 days', true),
    (500003, 'The compressed deadline part is accurate.', NULL, true, 300003, NULL, 400003, NULL, now() - interval '2 days', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO professor.reply_name (review_id, session_id, user_id, name)
VALUES
    (400001, 300001, 100001, 'Blue Falcon'),
    (400001, 300002, 100002, 'Silver Palm'),
    (400003, 300003, NULL, 'Quiet Wave')
ON CONFLICT (review_id, session_id) DO NOTHING;

INSERT INTO professor.reply_like (reply_id, session_id, user_id)
VALUES
    (500001, 300001, 100001),
    (500002, 300002, 100002),
    (500003, 300001, 100001)
ON CONFLICT (session_id, reply_id) DO NOTHING;
