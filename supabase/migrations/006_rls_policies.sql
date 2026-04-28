ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "own_prefs" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_plans" ON plans
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_plan_acts" ON plan_activities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_activities.plan_id AND plans.user_id = auth.uid())
  );

CREATE POLICY "own_weeks" ON weeks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_week_acts" ON week_activities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM weeks WHERE weeks.id = week_activities.week_id AND weeks.user_id = auth.uid())
  );

CREATE POLICY "own_notes" ON week_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM weeks WHERE weeks.id = week_notes.week_id AND weeks.user_id = auth.uid())
  );

CREATE POLICY "own_todos" ON activity_todos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM week_activities wa
      JOIN weeks w ON w.id = wa.week_id
      WHERE wa.id = activity_todos.week_activity_id
        AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM week_activities wa
      JOIN weeks w ON w.id = wa.week_id
      WHERE wa.id = activity_todos.week_activity_id
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "own_todo_inbox" ON todo_inbox
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_resources" ON resources
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_act_resources" ON activity_resources
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM resources r
      WHERE r.id = activity_resources.resource_id
        AND r.user_id = auth.uid()
    )
    AND (
      (
        activity_resources.plan_activity_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM plan_activities pa
          JOIN plans p ON p.id = pa.plan_id
          WHERE pa.id = activity_resources.plan_activity_id
            AND p.user_id = auth.uid()
        )
      )
      OR
      (
        activity_resources.week_activity_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM week_activities wa
          JOIN weeks w ON w.id = wa.week_id
          WHERE wa.id = activity_resources.week_activity_id
            AND w.user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM resources r
      WHERE r.id = activity_resources.resource_id
        AND r.user_id = auth.uid()
    )
    AND (
      (
        activity_resources.plan_activity_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM plan_activities pa
          JOIN plans p ON p.id = pa.plan_id
          WHERE pa.id = activity_resources.plan_activity_id
            AND p.user_id = auth.uid()
        )
      )
      OR
      (
        activity_resources.week_activity_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM week_activities wa
          JOIN weeks w ON w.id = wa.week_id
          WHERE wa.id = activity_resources.week_activity_id
            AND w.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "own_sync" ON sync_log
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE global_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_global_todos" ON global_todos
  FOR ALL USING (auth.uid() = user_id);
