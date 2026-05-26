INSERT INTO course.file (
    id,
    course_tag,
    name,
    type,
    size,
    blob_name,
    user_id,
    session_id,
    reviewed,
    visible,
    reviewed_at,
    download_count,
    created_at
)
VALUES
    (700001, 'COMP350', 'COMP350 project brief.pdf', 'application/pdf', 184320, 'dev/comp350-project-brief.pdf', 100002, 300002, false, false, NULL, 0, now() - interval '2 days'),
    (700002, 'COMP370', 'COMP370 normalization notes.pdf', 'application/pdf', 223744, 'dev/comp370-normalization-notes.pdf', 100001, 300001, true, true, now() - interval '4 days', 7, now() - interval '9 days'),
    (700003, 'MATH101', 'MATH101 worksheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 98304, 'dev/math101-worksheet.xlsx', NULL, 300003, true, false, now() - interval '1 day', 0, now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feedback (id, session_id, user_id, completed, created_at, current_question)
VALUES
    (800001, 300001, 100001, true, now() - interval '6 days', 'anything_else'),
    (800002, 300003, NULL, false, now() - interval '1 day', 'overall_experience')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feedback_entry (feedback_id, question, answer, created_at)
VALUES
    (800001, 'overall_experience', 'The new professor pages are easier to scan.', now() - interval '6 days'),
    (800001, 'course_materials', 'The upload flow makes sense, but moderation status should be visible.', now() - interval '6 days'),
    (800002, 'overall_experience', 'Testing anonymous feedback from seed data.', now() - interval '1 day')
ON CONFLICT (feedback_id, question) DO NOTHING;
