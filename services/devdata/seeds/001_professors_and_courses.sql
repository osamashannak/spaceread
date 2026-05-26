INSERT INTO course.course (tag, name, views)
VALUES
    ('COMP350', 'Software Engineering', 42),
    ('COMP370', 'Database Systems', 31),
    ('MATH101', 'Calculus I', 24),
    ('PHYS110', 'General Physics', 18),
    ('BUS201', 'Principles of Management', 12)
ON CONFLICT (tag) DO UPDATE
SET name = EXCLUDED.name,
    views = EXCLUDED.views;

INSERT INTO professor.professor (email, name, college, views, visible, university, aliases)
VALUES
    ('maya.hassan@example.edu', 'Maya Hassan', 'College of Information Technology', 84, true, 'United Arab Emirates University', ARRAY['Dr. Maya', 'M Hassan']),
    ('omar.alnuaimi@example.edu', 'Omar Al Nuaimi', 'College of Engineering', 67, true, 'United Arab Emirates University', ARRAY['Dr. Omar']),
    ('lina.farooq@example.edu', 'Lina Farooq', 'College of Science', 53, true, 'Khalifa University', ARRAY['L Farooq']),
    ('samir.rahman@example.edu', 'Samir Rahman', 'School of Business', 41, true, 'University of Sharjah', ARRAY['S Rahman'])
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    college = EXCLUDED.college,
    views = EXCLUDED.views,
    visible = EXCLUDED.visible,
    university = EXCLUDED.university,
    aliases = EXCLUDED.aliases;

INSERT INTO professor.professor_course_history (email, course_tag)
VALUES
    ('maya.hassan@example.edu', 'COMP350'),
    ('maya.hassan@example.edu', 'COMP370'),
    ('omar.alnuaimi@example.edu', 'PHYS110'),
    ('lina.farooq@example.edu', 'MATH101'),
    ('samir.rahman@example.edu', 'BUS201')
ON CONFLICT (email, course_tag) DO NOTHING;
