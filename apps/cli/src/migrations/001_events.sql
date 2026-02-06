CREATE TABLE IF NOT EXISTS streams (
  tenant_id text NOT NULL,
  stream_id text NOT NULL,
  stream_type text NOT NULL,
  version integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, stream_id)
);

CREATE TABLE IF NOT EXISTS events (
  tenant_id text NOT NULL,
  stream_id text NOT NULL,
  stream_type text NOT NULL,
  version integer NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  type_version integer NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL,
  request_id text NOT NULL,
  correlation_id text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (tenant_id, stream_id, version)
);

CREATE INDEX IF NOT EXISTS idx_events_by_stream
  ON events (tenant_id, stream_id);

CREATE INDEX IF NOT EXISTS idx_events_occurred_at
  ON events (occurred_at);

CREATE TABLE IF NOT EXISTS projection_checkpoints (
  tenant_id text NOT NULL,
  projection text NOT NULL,
  last_occurred_at timestamptz NOT NULL,
  last_event_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, projection)
);

CREATE TABLE IF NOT EXISTS dead_letters (
  tenant_id text NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);

CREATE TABLE IF NOT EXISTS example_read_models (
  tenant_id text NOT NULL,
  example_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, example_id)
);
