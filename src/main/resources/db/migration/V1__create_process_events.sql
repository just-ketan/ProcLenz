CREATE TABLE process_events (
    id UUID PRIMARY KEY,
    process_key VARCHAR(100) NOT NULL,
    case_id VARCHAR(200) NOT NULL,
    activity VARCHAR(200) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resource VARCHAR(200),
    event_identity VARCHAR(64) NOT NULL,
    CONSTRAINT uk_event_identity UNIQUE (event_identity)
);
CREATE INDEX idx_event_case_time ON process_events(process_key, case_id, occurred_at);
CREATE INDEX idx_event_process_time ON process_events(process_key, occurred_at);
CREATE INDEX idx_event_activity ON process_events(process_key, activity);
