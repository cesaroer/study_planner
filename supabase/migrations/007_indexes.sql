CREATE INDEX idx_plans_user ON plans(user_id);
CREATE INDEX idx_plan_acts_plan ON plan_activities(plan_id, dia, orden);
CREATE INDEX idx_weeks_user_start ON weeks(user_id, week_start);
CREATE INDEX idx_week_acts_week ON week_activities(week_id, dia, orden);
CREATE INDEX idx_week_notes_week ON week_notes(week_id, dia);
CREATE INDEX idx_todo_inbox_user ON todo_inbox(user_id, created_at DESC);
CREATE INDEX idx_resources_user ON resources(user_id);
CREATE INDEX idx_act_resources_resource ON activity_resources(resource_id);
