INSERT INTO moderation.reason (code, label, policy_area, policy_reference, active, sort_order)
VALUES
    ('harassment_or_abuse', 'Harassment or abuse', 'terms', NULL, true, 10),
    ('personal_or_sensitive_info', 'Personal or sensitive information', 'privacy', NULL, true, 20),
    ('spam_or_manipulation', 'Spam or manipulation', 'terms', NULL, true, 30),
    ('irrelevant_or_low_quality', 'Irrelevant or low-quality content', 'terms', NULL, true, 40),
    ('false_or_misleading', 'False or misleading content', 'terms', NULL, true, 50),
    ('unsafe_or_explicit_media', 'Unsafe or explicit media', 'safety', NULL, true, 60),
    ('copyright_or_file_policy', 'Copyright or file policy', 'terms', NULL, true, 70),
    ('academic_integrity', 'Academic integrity', 'terms', NULL, true, 80),
    ('privacy_request', 'Privacy request', 'privacy', NULL, true, 90),
    ('other', 'Other', 'other', NULL, true, 100)
ON CONFLICT (code) DO UPDATE
SET
    label = EXCLUDED.label,
    policy_area = EXCLUDED.policy_area,
    policy_reference = EXCLUDED.policy_reference,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order;

UPDATE moderation.reason
SET active = false
WHERE code IN (
    'personal_attack',
    'profanity_slur',
    'illegal_accusation',
    'fake_review',
    'threat_harm',
    'spam',
    'bias_favoritism'
);
