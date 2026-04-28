CREATE TABLE activity_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_activity_id UUID NOT NULL REFERENCES week_activities(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_todos_week_activity ON activity_todos(week_activity_id);
CREATE INDEX idx_todos_user ON activity_todos(user_id);

CREATE TABLE todo_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_identifier TEXT NOT NULL,
  text TEXT NOT NULL,
  reason TEXT NOT NULL,
  reviewed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_todo_inbox_user_reviewed ON todo_inbox(user_id, reviewed, created_at DESC);

CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  description TEXT,
  type TEXT DEFAULT 'link',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE activity_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  plan_activity_id UUID REFERENCES plan_activities(id) ON DELETE CASCADE,
  week_activity_id UUID REFERENCES week_activities(id) ON DELETE CASCADE,
  CHECK (
    (plan_activity_id IS NOT NULL AND week_activity_id IS NULL)
    OR
    (plan_activity_id IS NULL AND week_activity_id IS NOT NULL)
  ),
  UNIQUE(resource_id, plan_activity_id),
  UNIQUE(resource_id, week_activity_id),
  created_at TIMESTAMPTZ DEFAULT now()
);
