CREATE TABLE pomodoro_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_activity_id TEXT,
  activity_name TEXT NOT NULL,
  activity_type TEXT,
  duration_minutes INT NOT NULL DEFAULT 25,
  phase TEXT NOT NULL DEFAULT 'work'
    CHECK (phase IN ('work', 'break', 'long_break')),
  completed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pomodoro_user ON pomodoro_sessions(user_id, completed_at DESC);
CREATE INDEX idx_pomodoro_activity ON pomodoro_sessions(week_activity_id);

ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_pomodoro" ON pomodoro_sessions
  FOR ALL USING (auth.uid() = user_id);
