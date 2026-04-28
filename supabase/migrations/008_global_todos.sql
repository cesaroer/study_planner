CREATE TABLE global_todos (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'done')),
  description TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  tags TEXT[] DEFAULT '{}',
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_global_todos_user ON global_todos(user_id, created_at DESC);
CREATE INDEX idx_global_todos_status ON global_todos(user_id, status);
