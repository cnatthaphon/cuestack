CREATE DATABASE IF NOT EXISTS cuestack;

CREATE TABLE IF NOT EXISTS cuestack.data_events (
    timestamp DateTime64(3, 'UTC'),
    org_id UUID,
    channel String,
    source String,
    event_type String DEFAULT 'data',
    payload String,
    metadata String DEFAULT '{}'
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, channel, timestamp)
TTL toDateTime(timestamp) + INTERVAL 1 YEAR;

CREATE TABLE IF NOT EXISTS cuestack.audit_log (
    timestamp DateTime64(3, 'UTC'),
    org_id UUID,
    user_id UUID,
    entity_type String,
    entity_id String,
    action String,
    old_value String DEFAULT '{}',
    new_value String DEFAULT '{}',
    ip_address String DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, timestamp);
