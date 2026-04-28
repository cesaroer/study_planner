CREATE TABLE weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE TABLE week_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  plan_activity_id UUID REFERENCES plan_activities(id) ON DELETE SET NULL,
  dia TEXT NOT NULL CHECK (dia IN ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo')),
  actividad TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Algoritmos','Actividad Principal','Secundaria','Menor Prioridad','Conocimiento Pasivo')),
  icono TEXT DEFAULT '📝',
  completado BOOLEAN DEFAULT false,
  bloqueada BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  target_minutes INT DEFAULT 0,
  spent_minutes INT DEFAULT 0,
  pomodoro_sessions INT DEFAULT 0,
  orden INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE week_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  dia TEXT NOT NULL,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(week_id, dia)
);
