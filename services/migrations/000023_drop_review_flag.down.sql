CREATE TABLE IF NOT EXISTS professor.review_flag (
    review_id bigint NOT NULL,
    attribute text NOT NULL,
    score double precision NOT NULL,
    engine text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_flag_pk PRIMARY KEY (review_id)
);

INSERT INTO professor.review_flag (review_id, attribute, score, engine, created_at)
VALUES
    (1107823117159370752, 'TOXICITY', 0.60311776, 'perspective', '2025-08-22 00:13:33.534086'),
    (1107942584455532544, 'TOXICITY', 0.681338, 'perspective', '2025-08-22 08:08:16.766669'),
    (1108138011737985024, 'TOXICITY', 0.8696708, 'perspective', '2025-08-22 21:04:50.256256'),
    (1108426299149389824, 'TOXICITY', 0.5024724, 'perspective', '2025-08-23 16:10:23.344423'),
    (1109427135027613696, 'INSULT', 0.5130944, 'perspective', '2025-08-26 10:27:21.201953'),
    (1109765317447389184, 'TOXICITY', 0.55739564, 'perspective', '2025-08-27 08:51:10.173326'),
    (1111576315766509568, 'TOXICITY', 0.6588125, 'perspective', '2025-09-01 08:47:25.841602')
ON CONFLICT (review_id) DO NOTHING;
