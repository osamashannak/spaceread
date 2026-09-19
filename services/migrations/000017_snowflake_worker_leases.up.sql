CREATE SCHEMA snowflake_internal;

REVOKE ALL ON SCHEMA snowflake_internal FROM PUBLIC;

CREATE TABLE snowflake_internal.snowflake_worker_lease (
    worker_id smallint PRIMARY KEY,
    holder_token bytea,
    owner text,
    fencing_token bigint NOT NULL DEFAULT 0,
    lease_expires_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    reserved_through bigint NOT NULL DEFAULT -1,

    CONSTRAINT snowflake_worker_lease_worker_id_check
        CHECK (worker_id BETWEEN 0 AND 1023),
    CONSTRAINT snowflake_worker_lease_holder_token_check
        CHECK (holder_token IS NULL OR octet_length(holder_token) = 32),
    CONSTRAINT snowflake_worker_lease_holder_token_unique
        UNIQUE (holder_token),
    CONSTRAINT snowflake_worker_lease_owner_check
        CHECK (owner IS NULL OR char_length(btrim(owner)) BETWEEN 1 AND 255),
    CONSTRAINT snowflake_worker_lease_fencing_token_check
        CHECK (fencing_token >= 0),
    CONSTRAINT snowflake_worker_lease_reserved_through_check
        CHECK (reserved_through BETWEEN -1 AND 4398046511103),
    CONSTRAINT snowflake_worker_lease_holder_state_check
        CHECK (
            (
                holder_token IS NULL
                AND owner IS NULL
                AND lease_expires_at IS NULL
                AND heartbeat_at IS NULL
            )
            OR
            (
                holder_token IS NOT NULL
                AND owner IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND heartbeat_at IS NOT NULL
                AND lease_expires_at > heartbeat_at
            )
        )
);

COMMENT ON TABLE snowflake_internal.snowflake_worker_lease IS
    'Transaction-pooler-safe leases for the 10-bit Snowflake worker namespace.';
COMMENT ON COLUMN snowflake_internal.snowflake_worker_lease.holder_token IS
    'A cryptographically random 32-byte token generated independently for each lease holder.';
COMMENT ON COLUMN snowflake_internal.snowflake_worker_lease.fencing_token IS
    'Increments exactly once whenever a new holder acquires this worker.';
COMMENT ON COLUMN snowflake_internal.snowflake_worker_lease.lease_expires_at IS
    'Lease deadline calculated from the PostgreSQL clock, never from an application host clock.';
COMMENT ON COLUMN snowflake_internal.snowflake_worker_lease.heartbeat_at IS
    'Last successful renewal time taken from the PostgreSQL clock.';
COMMENT ON COLUMN snowflake_internal.snowflake_worker_lease.reserved_through IS
    'Never-decreasing inclusive high-watermark of elapsed milliseconds reserved since the Snowflake epoch.';

INSERT INTO snowflake_internal.snowflake_worker_lease (worker_id)
SELECT worker_id::smallint
FROM generate_series(0, 1023) AS worker_id;

CREATE FUNCTION snowflake_internal.guard_snowflake_worker_lease_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'Snowflake worker lease rows cannot be deleted or truncated'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.worker_id <> OLD.worker_id THEN
        RAISE EXCEPTION 'Snowflake worker IDs cannot be changed'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.reserved_through < OLD.reserved_through THEN
        RAISE EXCEPTION 'Snowflake reserved-through high-watermark cannot decrease'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.holder_token IS DISTINCT FROM OLD.holder_token THEN
        IF NEW.holder_token IS NULL THEN
            IF NEW.fencing_token <> OLD.fencing_token THEN
                RAISE EXCEPTION 'Snowflake fencing token cannot change when a lease is released'
                    USING ERRCODE = '23514';
            END IF;
        ELSIF OLD.fencing_token = 9223372036854775807
            OR NEW.fencing_token <> OLD.fencing_token + 1 THEN
            RAISE EXCEPTION 'Snowflake fencing token must increment exactly once for a new holder'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.fencing_token <> OLD.fencing_token THEN
        RAISE EXCEPTION 'Snowflake fencing token can change only when a new holder acquires the lease'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON TABLE snowflake_internal.snowflake_worker_lease FROM PUBLIC;
REVOKE ALL ON FUNCTION snowflake_internal.guard_snowflake_worker_lease_update() FROM PUBLIC;

CREATE TRIGGER snowflake_worker_lease_update_guard
BEFORE UPDATE OR DELETE ON snowflake_internal.snowflake_worker_lease
FOR EACH ROW
EXECUTE FUNCTION snowflake_internal.guard_snowflake_worker_lease_update();

CREATE TRIGGER snowflake_worker_lease_truncate_guard
BEFORE TRUNCATE ON snowflake_internal.snowflake_worker_lease
FOR EACH STATEMENT
EXECUTE FUNCTION snowflake_internal.guard_snowflake_worker_lease_update();
