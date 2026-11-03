-- Session lookups by token (authsession GetSessionID) had no index and scanned
-- the whole table. CONCURRENTLY avoids blocking session inserts while it builds;
-- keep it as the only statement so it does not run inside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS account_session_token_index
    ON account.session (token);
