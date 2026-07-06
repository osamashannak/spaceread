INSERT INTO moderation.reason (code, label, policy_area, policy_reference, active, sort_order)
VALUES
    ('personal_attack', 'Personal attack', 'terms', NULL, true, 30),
    ('profanity_slur', 'Profanity or slur', 'terms', NULL, true, 40),
    ('illegal_accusation', 'Illegal accusation', 'terms', NULL, true, 50),
    ('fake_review', 'Fake review', 'terms', NULL, true, 60),
    ('threat_harm', 'Threat of harm', 'safety', NULL, true, 70),
    ('spam', 'Spam', 'terms', NULL, true, 80),
    ('bias_favoritism', 'Bias or favoritism', 'terms', NULL, true, 90),
    ('personal_or_sensitive_info', 'Personal or sensitive information', 'privacy', NULL, true, 100),
    ('irrelevant_or_low_quality', 'Irrelevant or low-quality content', 'terms', NULL, true, 110),
    ('unsafe_or_explicit_media', 'Unsafe or explicit media', 'safety', NULL, true, 120),
    ('copyright_or_file_policy', 'Copyright or file policy', 'terms', NULL, true, 130),
    ('other', 'Other', 'other', NULL, true, 140)
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
    'harassment_or_abuse',
    'spam_or_manipulation',
    'false_or_misleading',
    'academic_integrity',
    'privacy_request'
);
