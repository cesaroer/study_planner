CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE plan_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  dia TEXT NOT NULL CHECK (dia IN ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo')),
  actividad TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Algoritmos','Actividad Principal','Secundaria','Menor Prioridad','Conocimiento Pasivo')),
  icono TEXT DEFAULT '📝',
  orden INT DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  target_minutes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  active_plan_id UUID REFERENCES plans(id),
  estimated_times JSONB DEFAULT '{
    "Actividad Principal": "60-90 min",
    "Secundaria": "40-45 min",
    "Menor Prioridad": "20-25 min",
    "Algoritmos": "15-20 min",
    "Conocimiento Pasivo": "10-15 min"
  }',
  sidebar_collapsed BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'dark',
  updated_at TIMESTAMPTZ DEFAULT now()
);
