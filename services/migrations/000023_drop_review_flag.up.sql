-- Legacy automated toxicity flags (7 rows, last written Sep 2025). Nothing reads
-- them since the admin signals feature was removed. The down migration restores them.
DROP TABLE IF EXISTS professor.review_flag;
