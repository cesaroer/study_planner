CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  op_id UUID NOT NULL UNIQUE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  base_revision BIGINT DEFAULT 0,
  revision BIGINT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_log_user_revision ON sync_log(user_id, revision DESC);
CREATE INDEX idx_sync_log_user_op ON sync_log(user_id, op_id);
