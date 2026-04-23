# Backend Plan — Study Planner

> FastAPI + Supabase + Offline-first Sync
> Documento de referencia para implementación por fases

---

## 1. Stack Tecnológico

| Componente | Tecnología | Rol |
|------------|-----------|-----|
| **Frontend** | React 18 (CRA existente) | UI |
| **Backend** | FastAPI (Python, Vercel Serverless) | API REST |
| **Base de datos** | Supabase PostgreSQL | Persistencia |
| **Auth** | Supabase Auth (email/password) | Registro, login, recovery |
| **Offline** | IndexedDB via `idb` + Service Worker | Cache local + cola de sync |
| **Realtime** | Supabase Realtime | Sync entre dispositivos |
| **Deploy** | Vercel (monorepo: frontend + api/) | Un solo deploy |

---

## 2. Estructura del Proyecto

```
study-planner/
├── api/                                  ← FastAPI Serverless (Vercel)
│   ├── index.py                          ← App entry point
│   ├── requirements.txt                  ← Dependencias Python
│   ├── config.py                         ← Env vars (SUPABASE_URL, etc.)
│   ├── database.py                       ← Supabase client init
│   ├── middleware/
│   │   └── auth.py                       ← JWT verification middleware
│   ├── models/
│   │   ├── __init__.py
│   │   ├── plan.py                       ← Plan + PlanActivity schemas
│   │   ├── activity.py                   ← Activity schemas (plan + week)
│   │   ├── week.py                       ← Week schemas
│   │   ├── todo.py                       ← Todo schemas
│   │   ├── note.py                       ← Note schemas
│   │   ├── resource.py                   ← Resource schemas
│   │   ├── stats.py                      ← Stats response schemas
│   │   └── preferences.py               ← UserPreferences schemas
│   └── routes/
│       ├── __init__.py
│       ├── auth.py                       ← Auth proxy endpoints
│       ├── plans.py                      ← CRUD planes
│       ├── plan_activities.py            ← CRUD actividades de plan
│       ├── weeks.py                      ← Deploy + week management
│       ├── week_activities.py            ← CRUD actividades de semana
│       ├── notes.py                      ← Notas por día
│       ├── todos.py                      ← Todos por actividad semanal + inbox migración
│       ├── resources.py                  ← CRUD recursos
│       ├── tags.py                       ← Tags únicas
│       ├── stats.py                      ← Estadísticas
│       ├── preferences.py               ← Preferencias de usuario
│       └── sync.py                       ← Offline sync endpoints
├── supabase/
│   └── migrations/
│       ├── 001_profiles.sql
│       ├── 002_plans.sql
│       ├── 003_weeks.sql
│       ├── 004_todos_notes_resources.sql
│       ├── 005_preferences.sql
│       ├── 006_rls_policies.sql
│       └── 007_indexes.sql
├── src/
│   ├── services/                         ← NUEVO: capa de datos
│   │   ├── supabaseClient.js             ← Init Supabase client
│   │   ├── offlineQueue.js              ← IndexedDB + cola de operaciones
│   │   ├── syncEngine.js                ← Sync logic (push/pull)
│   │   └── api.js                        ← HTTP client wrapper
│   ├── hooks/
│   │   ├── useOfflineSync.js            ← Hook para estado de sync
│   │   └── useLocalStorage.js           ← (eliminar eventualmente)
│   ├── components/                       ← (existentes, sin cambios iniciales)
│   ├── auth/
│   │   └── cryptoUtils.js               ← (eliminar eventualmente)
│   ├── data/
│   │   └── defaultActivities.js          ← (migrar a seed de BD)
│   ├── App.js
│   ├── index.js
│   └── index.css
├── vercel.json                           ← Routing config
├── BACKEND_PLAN.md                       ← Este documento
└── package.json
```

---

## 3. Schema de Base de Datos (PostgreSQL / Supabase)

### 3.1 Tabla: `profiles`

Extiende Supabase Auth users con metadata adicional.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);
```

### 3.2 Tabla: `user_preferences`

Preferencias configurables por usuario, incluyendo tiempos estimados por tipo.

```sql
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
```

### 3.3 Tablas: `plans` + `plan_activities`

Templates de planes de estudio con actividades por día.

```sql
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
```

**Notas:**
- `is_default` marca el plan auto-generado (equivale a `plan_default` actual)
- `orden` controla el orden de las actividades dentro de cada día
- `tags` usa `TEXT[]` nativo de PostgreSQL
- `target_minutes` campo futuro para pomodoro/time tracking

### 3.4 Tablas: `weeks` + `week_activities`

Instancias desplegadas de semanas con estado (completado, bloqueada, etc.).

```sql
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
```

**Notas:**
- `plan_activity_id` vincula la actividad de semana con su template del plan (para sync bidireccional)
- `updated_at` se conserva para auditoría y UI; la resolución offline usa `op_id` + `base_revision`/`revision`
- `spent_minutes` y `pomodoro_sessions` son para features futuras

### 3.5 Tabla: `week_notes`

Notas por día de la semana. Actualmente se pierden al refrescar (bug del app actual).

```sql
CREATE TABLE week_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  dia TEXT NOT NULL,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(week_id, dia)
);
```

### 3.6 Tabla: `activity_todos`

Listas de tareas (checklist) por actividad. Actualmente en localStorage sin prefijo de usuario (bug).

```sql
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
```

**Nota:** `activity_todos` queda ligado a `week_activity_id` para garantizar integridad referencial y evitar huérfanos.

### 3.6.1 Tabla: `todo_inbox`

TODOs no mapeables durante migración. Evita pérdida de datos y permite revisión manual posterior.

```sql
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
```

### 3.7 Tablas: `resources` + `activity_resources`

Recursos de aprendizaje vinculados a actividades.

```sql
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
```

### 3.8 Tabla: `sync_log`

Log de operaciones para soporte offline-first. Permite a clientes consultar cambios desde su último sync.

```sql
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
```

### 3.9 Row Level Security (RLS)

Todas las tablas usan RLS para garantizar que cada usuario solo accede a sus propios datos.

```sql
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
```

### 3.10 Índices adicionales

```sql
CREATE INDEX idx_plans_user ON plans(user_id);
CREATE INDEX idx_plan_acts_plan ON plan_activities(plan_id, dia, orden);
CREATE INDEX idx_weeks_user_start ON weeks(user_id, week_start);
CREATE INDEX idx_week_acts_week ON week_activities(week_id, dia, orden);
CREATE INDEX idx_week_notes_week ON week_notes(week_id, dia);
CREATE INDEX idx_todo_inbox_user ON todo_inbox(user_id, created_at DESC);
CREATE INDEX idx_resources_user ON resources(user_id);
CREATE INDEX idx_act_resources_resource ON activity_resources(resource_id);
```

### 3.11 Diagrama de relaciones

```
auth.users (Supabase)
    │
    ├── profiles (1:1)
    │     │
    │     ├── user_preferences (1:1)
    │     │     └── active_plan_id → plans.id
    │     │
    │     ├── plans (1:N)
    │     │     └── plan_activities (1:N)
    │     │           └── activity_resources → resources
    │     │
    │     ├── weeks (1:N)
    │     │     ├── week_activities (1:N)
    │     │     │     └── plan_activity_id → plan_activities.id
    │     │     │     └── activity_resources → resources
    │     │     └── week_notes (1:N, UNIQUE per dia)
    │     │
    │     ├── activity_todos (1:N, linked to week_activity_id)
    │     ├── todo_inbox (1:N, no mapeables de migración)
    │     │
    │     ├── resources (1:N)
    │     │     └── activity_resources (1:N)
    │     │
    │     └── sync_log (1:N)
```

---

## 4. API Endpoints

### 4.1 Auth

Supabase Auth maneja registro, login, password recovery, y JWT tokens directamente desde el frontend. El backend solo valida el token.

```
POST   /api/auth/profile                     → crear/obtener profile post-signup
GET    /api/auth/profile                     → obtener profile actual
GET    /api/auth/me                          → current user + profile info
```

**Flujo de auth:**
1. Frontend usa `supabase.auth.signUp()` / `supabase.auth.signInWithPassword()`
2. Supabase devuelve JWT token
3. Frontend envía token en `Authorization: Bearer <token>` header
4. Backend valida token con Supabase JWKS (`RS256`) + `issuer` + `audience`
5. Backend extrae `user_id` del token para RLS

### 4.2 Plans

```
GET    /api/plans                             → listar planes del usuario
POST   /api/plans                             → crear plan vacío
                                        Body: { "name": "string" }
PUT    /api/plans/{plan_id}                   → renombrar plan
                                        Body: { "name": "string" }
DELETE /api/plans/{plan_id}                   → eliminar plan (no default)
PATCH  /api/plans/{plan_id}/activate          → activar plan (desactiva otros)
POST   /api/plans/{plan_id}/copy/{source_id}  → copiar actividades de otro plan
```

### 4.3 Plan Activities

```
GET    /api/plans/{plan_id}/activities                → actividades agrupadas por día
                                                Response: { "Lunes": [...], "Martes": [...], ... }

POST   /api/plans/{plan_id}/activities                → agregar actividad
                                                Body: { "dia": "Lunes", "actividad": "...", "tipo": "...", "icono": "...", "orden": 0, "tags": [] }

PUT    /api/plans/{plan_id}/activities/{act_id}       → editar actividad
                                                Body: { "actividad": "...", "tipo": "...", "icono": "...", "tags": [], "orden": 0 }

DELETE /api/plans/{plan_id}/activities/{act_id}       → eliminar actividad

POST   /api/plans/{plan_id}/activities/batch          → operaciones bulk
                                                Body: { "operations": [
                                                  { "action": "add", "dia": "Lunes", "activity": {...} },
                                                  { "action": "update", "activityId": "...", "updates": {...} },
                                                  { "action": "delete", "activityId": "..." },
                                                  { "action": "reorder", "orderings": [{"id": "...", "orden": 0}, ...] }
                                                ] }
```

### 4.4 Weeks

```
GET    /api/weeks?week_start=YYYY-MM-DD              → obtener semana con actividades
                                                Response: { "week": {...}, "activities": [...], "notes": {...} }

GET    /api/weeks/range?from=YYYY-MM-DD&to=YYYY-MM-DD  → semanas en rango
                                                Response: [{ "week": {...}, "activities": [...] }, ...]

POST   /api/weeks/deploy                             → desplegar plan activo a una semana
                                                Body: { "week_start": "YYYY-MM-DD" }
                                                Crea week + copia actividades del plan activo
```

### 4.5 Week Activities

```
GET    /api/weeks/{week_id}/activities                → actividades de la semana

POST   /api/weeks/{week_id}/activities                → agregar actividad
                                                Body: { "dia": "Lunes", "actividad": "...", "tipo": "...", "icono": "..." }
                                                Query: ?sync_plan=true  (también agrega al plan activo)

PUT    /api/weeks/{week_id}/activities/{act_id}       → editar actividad
                                                Body: { "completado": true, "bloqueada": false, "tags": [], ... }

DELETE /api/weeks/{week_id}/activities/{act_id}       → eliminar actividad

POST   /api/weeks/{week_id}/activities/{act_id}/move  → mover a otro día
                                                Body: { "target_day": "Martes" }

POST   /api/weeks/{week_id}/check-all                 → marcar todas completadas en un día
                                                Body: { "dia": "Lunes" }

POST   /api/weeks/{week_id}/uncheck-all               → desmarcar todas en un día
                                                Body: { "dia": "Lunes" }
```

### 4.6 Notes

```
GET    /api/weeks/{week_id}/notes                     → todas las notas de la semana
                                                Response: { "Lunes": "texto...", "Martes": "texto..." }

PUT    /api/weeks/{week_id}/notes/{dia}               → guardar nota
                                                Body: { "content": "texto de la nota" }
```

### 4.7 Todos

```
GET    /api/week-activities/{week_activity_id}/todos  → lista de todos
POST   /api/week-activities/{week_activity_id}/todos  → agregar todo
                                                Body: { "text": "Leer capítulo 5" }
PUT    /api/todos/{todo_id}                           → editar/toggle todo
                                                Body: { "completed": true }  o  { "text": "nuevo texto" }
DELETE /api/todos/{todo_id}                           → eliminar todo
POST   /api/week-activities/{week_activity_id}/todos/clear  → limpiar completados
GET    /api/todos/inbox                               → listar TODOs no mapeables
PATCH  /api/todos/inbox/{inbox_id}                    → marcar revisado o reasignar
                                                Body: { "reviewed": true } o { "week_activity_id": "..." }
```

### 4.8 Tags

```
GET    /api/tags                                      → todas las tags únicas del usuario
                                                Response: ["Algoritmos", "Proyecto", "Lectura", ...]
```

### 4.9 Resources

```
GET    /api/resources                                 → listar recursos del usuario
POST   /api/resources                                 → crear recurso
                                                Body: { "title": "...", "url": "...", "description": "...", "type": "link", "tags": [] }
PUT    /api/resources/{resource_id}                   → editar recurso
DELETE /api/resources/{resource_id}                   → eliminar recurso
POST   /api/activities/{act_id}/resources             → vincular recurso a actividad
                                                Body: { "resource_id": "..." }
```

### 4.10 Statistics

```
GET    /api/stats/completions?from=YYYY-MM-DD&to=YYYY-MM-DD
                                                → datos de completions por fecha (heatmap)
                                                Response: { "2025-01-06": { "completed": 3, "total": 5 }, ... }

GET    /api/stats/streak                              → racha actual y máxima
                                                Response: { "current": 5, "max": 12, "last_date": "2025-01-10" }

GET    /api/stats/frequency?week_start=YYYY-MM-DD     → actividad más frecuente por tipo
                                                Response: {
                                                  "overall": { "actividad": "LeetCode", "count": 15 },
                                                  "by_type": {
                                                    "Algoritmos": { "actividad": "LeetCode Python", "count": 8 },
                                                    "Actividad Principal": { "actividad": "iOS", "count": 5 },
                                                    ...
                                                  }
                                                }

GET    /api/stats/overview                            → resumen general
                                                Response: {
                                                  "total_activities": 150,
                                                  "total_completed": 87,
                                                  "completion_rate": 0.58,
                                                  "total_weeks": 12,
                                                  "most_productive_day": "Miércoles",
                                                  "avg_per_week": 7.25
                                                }
```

### 4.11 Preferences

```
GET    /api/preferences                               → preferencias del usuario
PUT    /api/preferences                               → actualizar preferencias
                                                Body: {
                                                  "active_plan_id": "...",
                                                  "estimated_times": { "Algoritmos": "20-30 min" },
                                                  "sidebar_collapsed": false,
                                                  "theme": "dark"
                                                }
```

### 4.12 Sync (Offline-first)

```
GET    /api/sync/changes?since_revision=42             → cambios desde última revisión aplicada
                                                Response: {
                                                  "changes": [
                                                    { "revision": 43, "op_id": "...", "table": "week_activities", "operation": "UPDATE", "record": {...} },
                                                    ...
                                                  ],
                                                  "last_revision": 58
                                                }

POST   /api/sync/push                                 → subir cola de cambios offline
                                                Body: {
                                                  "changes": [
                                                    { "op_id": "...", "table": "week_activities", "operation": "UPDATE", "record_id": "...", "base_revision": 42, "data": {...} },
                                                    ...
                                                  ]
                                                }
                                                Response: {
                                                  "results": [
                                                    { "op_id": "...", "status": "applied", "revision": 59 },
                                                    { "op_id": "...", "status": "duplicate", "revision": 59 },
                                                    { "op_id": "...", "status": "conflict", "server_record": {...}, "revision": 60 }
                                                  ],
                                                  "last_revision": 60
                                                }
```

### 4.13 Errores estándar (todos los endpoints)

```
400 Bad Request     → payload inválido
401 Unauthorized    → token ausente o inválido
403 Forbidden       → RLS/ownership
404 Not Found       → recurso inexistente
409 Conflict        → conflicto de revisión en sync/mutaciones concurrentes
```

---

## 5. Offline-first: Arquitectura de Sync

### 5.1 Diagrama de flujo

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                             │
│                                                          │
│  React Components                                        │
│       ↕ (lectura/escritura local)                        │
│  Sync Engine (src/services/syncEngine.js)                │
│       ↕                                                  │
│  ┌─────────────────────────────────────┐                 │
│  │        IndexedDB (idb)              │                 │
│  │  ├── plans_store    (cache plans)   │                 │
│  │  ├── weeks_store    (cache weeks)   │                 │
│  │  ├── todos_store    (cache todos)   │                 │
│  │  ├── notes_store    (cache notes)   │                 │
│  │  ├── resources_store               │                 │
│  │  ├── preferences_store              │                 │
│  │  └── queue_store     (pending ops)  │                 │
│  └─────────────────────────────────────┘                 │
│       ↕                                                  │
│  Service Worker (intercepta fetch fallido)               │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP cuando hay conexión
                         ↕
┌─────────────────────────────────────────────────────────┐
│                  BACKEND FastAPI                         │
│                                                          │
│  JWT Auth Middleware                                     │
│       ↕                                                  │
│  Routes (CRUD + sync endpoints)                         │
│       ↕                                                  │
│  Supabase PostgreSQL                                    │
│       + sync_log (audit trail)                          │
│       + Realtime subscriptions                          │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Flujo de operaciones offline

**Escritura (offline):**
1. Usuario realiza acción (toggle, agregar, editar, eliminar)
2. Sync Engine escribe en IndexedDB inmediatamente (UI responde instantáneo)
3. Sync Engine agrega operación a `queue_store` con status `pending`
4. UI se actualiza desde IndexedDB (sin esperar red)

**Escritura (online):**
1. Además de escribir en IndexedDB, se intenta enviar al backend
2. Si tiene éxito, se marca la operación como `synced`
3. Si falla, queda como `pending` y se reintenta después

**Sync al reconectar:**
1. `syncEngine` detecta que hay conexión (via `navigator.onLine` o retry exitoso)
2. Procesa cola de operaciones `pending` en orden (FIFO)
3. Envía batch de cambios a `POST /api/sync/push`
4. Luego consulta `GET /api/sync/changes?since_revision=<last_revision>` para traer cambios del server
5. Aplica cambios del server a IndexedDB (merge)
6. Actualiza UI

### 5.3 Conflict resolution

**Estrategia: Idempotencia + revisión de servidor**

- Cada mutación cliente lleva `op_id` único (idempotencia)
- Cada mutación incluye `base_revision` (revisión local conocida por el cliente)
- El servidor asigna `revision` monotónica por cambio aplicado
- Si llega un `op_id` repetido: respuesta `duplicate` (sin re-aplicar)
- Si `base_revision` quedó atrás: respuesta `conflict` con `server_record` y `revision` actual
- El cliente aplica merge local usando el `server_record` y continúa con la cola

### 5.4 Nuevas dependencias frontend

```json
{
  "@supabase/supabase-js": "^2.45.0",
  "idb": "^8.0.0"
}
```

### 5.5 IndexedDB Schema

```
Database: studyplanner_offline

Object Stores:
  plans          { key: id }          index: user_id
  plan_activities { key: id }         index: plan_id, [plan_id+dia]
  weeks          { key: id }          index: user_id, week_start
  week_activities { key: id }         index: week_id, [week_id+dia]
  week_notes     { key: [week_id+dia] }  index: week_id
  activity_todos { key: id }          index: week_activity_id
  todo_inbox     { key: id }          index: user_id, reviewed
  resources      { key: id }          index: user_id
  preferences    { key: user_id }
  sync_meta      { key: user_id }     fields: last_revision
  sync_queue     { key: id, autoIncrement: true }  index: status, queued_at
    → status: 'pending' | 'syncing' | 'synced' | 'failed'
    → payload: { op_id, table, operation, record_id, base_revision, data, queued_at }
```

---

## 6. vercel.json

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.py" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

**Explicación:**
- `/api/*` → enruta al FastAPI serverless function (`api/index.py`)
- Todo lo demás → sirve el React SPA (index.html)
- Vercel detecta `api/` con `requirements.txt` como Python serverless function automáticamente

---

## 7. requirements.txt (Backend Python)

```
fastapi==0.115.0
supabase==2.7.0
python-jose[cryptography]==3.3.0
pydantic==2.9.0
python-dotenv==1.0.1
httpx==0.27.0
```

**Paquetes y su rol:**
| Paquete | Rol |
|---------|-----|
| `fastapi` | Framework web (ASGI) |
| `supabase` | Cliente Python para PostgreSQL + Auth |
| `python-jose` | Validación de JWT tokens |
| `pydantic` | Schemas de request/response |
| `python-dotenv` | Leer `.env` en desarrollo local |
| `httpx` | HTTP client async (para Supabase REST API) |

---

## 8. Migración de datos localStorage → Supabase

### 8.1 Estrategia

Se creará un endpoint especial de migración que acepta un dump de localStorage y lo inserta en la base de datos:

```
POST /api/migrate
Body: {
  "migration_id": "uuid-v4",
  "localStorage_dump": {
    "studyPlannerData_username": { "2025-01-06": [...], ... },
    "studyPlans_username": { "plans": [...], "activePlanId": "..." },
    "week_username_2025-01-06": [...],
    "activity_todos": { "act-1": [...], ... }
  }
}
```

`user_id` nunca viaja en el body: se toma exclusivamente de `auth.uid()` del JWT.

### 8.2 Pasos de la migración

1. **Reconciliar dual storage**: `studyPlannerData_*` y `week_*_*` pueden tener datos duplicados. Se usa el más reciente (comparar contenido).
2. **Crear profile**: Vincular con cuenta de Supabase Auth
3. **Insertar planes**: Convertir cada plan del localStorage a registro en `plans`
4. **Insertar plan_activities**: Mapear actividades del plan, asignar `orden` por posición en array
5. **Insertar weeks**: Una entrada por cada `weekKey` en `studyPlannerData`
6. **Insertar week_activities**: Mapear cada actividad de semana, normalizar campos
7. **Mapear activity_todos**: Convertir a `week_activity_id` cuando exista match confiable
8. **Inbox no mapeables**: Enviar TODOs sin match a `todo_inbox` con `reason`
9. **Idempotencia**: `migration_id` evita ejecutar dos veces la misma migración
10. **Deduplicar**: Eliminar duplicados por ID o por (actividad + dia + semana)

### 8.3 Script de migración frontend

Un componente React temporal que:
1. Lee todo el localStorage del usuario actual
2. Envía al endpoint `POST /api/migrate`
3. Muestra progreso y resultado
4. Opcionalmente limpia el localStorage después de migración exitosa

---

## 9. Modelo de datos: Entidades Pydantic

**Nota:** para defaults mutables se usa `Field(default_factory=list)`.

```python
from pydantic import BaseModel, Field
```

### 9.1 Plan

```python
class PlanCreate(BaseModel):
    name: str

class PlanUpdate(BaseModel):
    name: str

class PlanResponse(BaseModel):
    id: str
    user_id: str
    name: str
    is_default: bool
    created_at: str
    updated_at: str
    activities: Optional[Dict[str, List["PlanActivityResponse"]]] = None
```

### 9.2 Plan Activity

```python
class PlanActivityCreate(BaseModel):
    dia: str
    actividad: str
    tipo: str
    icono: str = "📝"
    orden: int = 0
    tags: List[str] = Field(default_factory=list)

class PlanActivityUpdate(BaseModel):
    actividad: Optional[str] = None
    tipo: Optional[str] = None
    icono: Optional[str] = None
    orden: Optional[int] = None
    tags: Optional[List[str]] = None

class PlanActivityResponse(BaseModel):
    id: str
    plan_id: str
    dia: str
    actividad: str
    tipo: str
    icono: str
    orden: int
    tags: List[str]
    target_minutes: int
    created_at: str
```

### 9.3 Week Activity

```python
class WeekActivityCreate(BaseModel):
    dia: str
    actividad: str
    tipo: str
    icono: str = "📝"
    orden: int = 0
    tags: List[str] = Field(default_factory=list)
    sync_plan: bool = False

class WeekActivityUpdate(BaseModel):
    actividad: Optional[str] = None
    tipo: Optional[str] = None
    icono: Optional[str] = None
    completado: Optional[bool] = None
    bloqueada: Optional[bool] = None
    tags: Optional[List[str]] = None
    orden: Optional[int] = None
    spent_minutes: Optional[int] = None
    pomodoro_sessions: Optional[int] = None

class WeekActivityResponse(BaseModel):
    id: str
    week_id: str
    plan_activity_id: Optional[str]
    dia: str
    actividad: str
    tipo: str
    icono: str
    completado: bool
    bloqueada: bool
    tags: List[str]
    target_minutes: int
    spent_minutes: int
    pomodoro_sessions: int
    orden: int
    updated_at: str
```

### 9.4 Todo

```python
class TodoCreate(BaseModel):
    text: str

class TodoUpdate(BaseModel):
    text: Optional[str] = None
    completed: Optional[bool] = None

class TodoResponse(BaseModel):
    id: str
    week_activity_id: str
    text: str
    completed: bool
    created_at: str
```

### 9.5 Note

```python
class NoteUpdate(BaseModel):
    content: str

class NoteResponse(BaseModel):
    id: str
    week_id: str
    dia: str
    content: str
    updated_at: str
```

### 9.6 Resource

```python
class ResourceCreate(BaseModel):
    title: str
    url: Optional[str] = None
    description: Optional[str] = None
    type: str = "link"
    tags: List[str] = Field(default_factory=list)

class ResourceUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None

class ResourceResponse(BaseModel):
    id: str
    title: str
    url: Optional[str]
    description: Optional[str]
    type: str
    tags: List[str]
    created_at: str
```

### 9.7 Preferences

```python
class PreferencesUpdate(BaseModel):
    active_plan_id: Optional[str] = None
    estimated_times: Optional[Dict[str, str]] = None
    sidebar_collapsed: Optional[bool] = None
    theme: Optional[str] = None

class PreferencesResponse(BaseModel):
    user_id: str
    active_plan_id: Optional[str]
    estimated_times: Dict[str, str]
    sidebar_collapsed: bool
    theme: str
    updated_at: str
```

### 9.8 Stats

```python
class CompletionEntry(BaseModel):
    completed: int
    total: int

class StreakResponse(BaseModel):
    current: int
    max: int
    last_date: str

class FrequencyEntry(BaseModel):
    actividad: str
    count: int

class FrequencyResponse(BaseModel):
    overall: Optional[FrequencyEntry]
    by_type: Dict[str, FrequencyEntry]

class OverviewResponse(BaseModel):
    total_activities: int
    total_completed: int
    completion_rate: float
    total_weeks: int
    most_productive_day: str
    avg_per_week: float
```

---

## 10. Auth Middleware (Backend)

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
import os
import time

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_JWKS_URL = os.environ.get("SUPABASE_JWKS_URL", f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")
SUPABASE_JWT_ISSUER = os.environ.get("SUPABASE_JWT_ISSUER", f"{SUPABASE_URL}/auth/v1")
SUPABASE_JWT_AUDIENCE = "authenticated"
_jwks_cache = {"keys": [], "expires_at": 0}

security = HTTPBearer()

async def get_jwks():
    if _jwks_cache["keys"] and time.time() < _jwks_cache["expires_at"]:
        return _jwks_cache["keys"]
    async with httpx.AsyncClient(timeout=5) as client:
        response = await client.get(SUPABASE_JWKS_URL)
        response.raise_for_status()
        payload = response.json()
    _jwks_cache["keys"] = payload.get("keys", [])
    _jwks_cache["expires_at"] = time.time() + 3600
    return _jwks_cache["keys"]

def pick_jwk(token: str, jwks: list):
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    for key in jwks:
        if key.get("kid") == kid:
            return key
    raise HTTPException(status_code=401, detail="Unknown signing key")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        jwks = await get_jwks()
        key = pick_jwk(token, jwks)
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=SUPABASE_JWT_AUDIENCE,
            issuer=SUPABASE_JWT_ISSUER
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user_id, "email": payload.get("email")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

---

## 11. Frontend → Backend: Mapeo de estado

Tabla completa de qué estado se migra al backend y cuál se queda en frontend.

### 11.1 Se va al Backend (persistido)

| Estado actual | Tabla destino | Notas |
|---------------|---------------|-------|
| `user` | `profiles` + Supabase Auth | Email/password en vez de username-only |
| `studyPlans` | `plans` + `plan_activities` | Array → registros separados |
| `activePlanId` | `user_preferences.active_plan_id` | Campo en tabla de preferencias |
| `weeksData` | `weeks` + `week_activities` | Por semana en vez de un blob |
| `notes` | `week_notes` | Actualmente se pierde al refrescar (bug) |
| `completions` | Computado desde `week_activities` | Query en vez de state |
| `activity_todos` (localStorage) | `activity_todos` + `todo_inbox` | Se intenta mapear a `week_activity_id`; no mapeables van a inbox |
| Trusted devices | JWT tokens de Supabase | Ya no se necesita |
| `userList` | Supabase Auth | Ya no se necesita |

### 11.2 Se queda en Frontend (session/UI)

| Estado | Tipo | Notas |
|--------|------|-------|
| `currentWeek` | UI state | Semana seleccionada actualmente |
| `selectedDate` | UI state | Fecha seleccionada |
| `searchQuery` | UI state | Texto de búsqueda |
| `selectedTags` | UI state | Tags seleccionadas para filtrar |
| `focusMode` | UI state | Toggle de focus mode |
| `focusSkippedIds` | UI state | IDs saltados en focus mode |
| `isQuickAddOpen` | UI state | Modal abierto |
| `isFilterModalOpen` | UI state | Modal abierto |
| `dragState` | UI state | Estado de drag-and-drop |
| `dropTargetDay` | UI state | Día target de drop |
| `activityContextMenu` | UI state | Posición del context menu |
| `contextEditForm` | UI state | Form state |
| `contextTagsForm` | UI state | Form state |
| `quickAddForm` | UI state | Form state |
| `isModalOpen` / `selectedDay` | UI state | Modal state |
| `showFrequencyModal` | UI state | Modal state |
| `isCalendarModalOpen` | UI state | Modal state |
| `showSettingsModal` | UI state | Modal state |
| `isResourcesModalOpen` | UI state | Modal state |
| `activeSidebarSection` | UI state | Sección activa del sidebar |
| `isSidebarCollapsed` | UI state | Sidebar colapsado |
| `undoStack` / `redoStack` | In-memory | Optimistic rollback (no backend) |

---

## 12. Plan de Implementación por Fases

### Fase 0: Setup de infraestructura
**Objetivo:** Proyecto Supabase + estructura de carpetas

- [ ] Crear proyecto en Supabase
- [ ] Obtener URL, anon key, service role key, JWKS URL y JWT issuer
- [ ] Ejecutar migrations SQL (tablas + RLS + índices)
- [ ] Crear carpeta `api/` con `index.py`, `requirements.txt`, `config.py`, `database.py`
- [ ] Crear `vercel.json`
- [ ] Crear `.env` local con credenciales
- [ ] Verificar que Vercel detecta la serverless function

**Entregable:** Proyecto Supabase con schema vacío, FastAPI responde `{"status": "ok"}`

---

### Fase 1: Backend — CRUD de planes y actividades
**Objetivo:** Endpoints funcionales para planes y actividades de plan

- [ ] `models/plan.py` — Pydantic schemas
- [ ] `models/activity.py` — Pydantic schemas
- [ ] `middleware/auth.py` — JWT verification
- [ ] `routes/plans.py` — GET, POST, PUT, DELETE, activate, copy
- [ ] `routes/plan_activities.py` — GET, POST, PUT, DELETE, batch
- [ ] `database.py` — funciones CRUD con supabase-py
- [ ] Aplicar hardening de schema y RLS (constraints + policies estrictas)
- [ ] Definir contrato de errores (`400/401/403/404/409`) en respuestas
- [ ] Tests manuales con curl / Postman

**Entregable:** CRUD completo de planes y actividades verificable con curl

---

### Fase 2: Backend — Weeks + Notes + Todos + Tags
**Objetivo:** Endpoints para semanas, notas, todos y tags

- [ ] `models/week.py` — Week + WeekActivity schemas
- [ ] `models/todo.py` — Todo schemas
- [ ] `models/note.py` — Note schemas
- [ ] `routes/weeks.py` — GET, deploy
- [ ] `routes/week_activities.py` — GET, POST, PUT, DELETE, move, check-all, uncheck-all
- [ ] `routes/notes.py` — GET, PUT
- [ ] `routes/todos.py` — GET, POST, PUT, DELETE, clear + inbox review
- [ ] `routes/tags.py` — GET (tags únicas)
- [ ] Tests manuales con curl / Postman

**Entregable:** Todos los endpoints de datos funcionales

---

### Fase 3: Backend — Auth + Stats + Resources + Preferences
**Objetivo:** Auth completo, estadísticas, recursos y preferencias

- [ ] `routes/auth.py` — profile management
- [ ] `models/stats.py` — Stats schemas
- [ ] `models/resource.py` — Resource schemas
- [ ] `models/preferences.py` — Preferences schemas
- [ ] `routes/stats.py` — completions, streak, frequency, overview
- [ ] `routes/resources.py` — CRUD
- [ ] `routes/preferences.py` — GET, PUT
- [ ] Queries SQL de estadísticas (completions, streak, frequency)
- [ ] Tests manuales con curl / Postman

**Entregable:** Backend completo, todos los endpoints funcionales

---

### Fase 4: Frontend — Supabase Auth integration
**Objetivo:** Reemplazar auth de localStorage por Supabase Auth

- [ ] Instalar `@supabase/supabase-js`
- [ ] Crear `src/services/supabaseClient.js`
- [ ] Nuevo componente de login/registro con email + password
- [ ] Password recovery flow
- [ ] Mantener sesión con Supabase (auto-login)
- [ ] Integrar JWT token en llamadas API

**Entregable:** Login/registro funciona con Supabase Auth

---

### Fase 5: Frontend — Offline-first layer
**Objetivo:** IndexedDB + cola de sync

- [ ] Instalar `idb`
- [ ] Crear `src/services/offlineQueue.js` — IndexedDB stores + cola
- [ ] Crear `src/services/syncEngine.js` — push/pull con `op_id` + `base_revision`
- [ ] Crear `src/services/api.js` — HTTP client wrapper con auth
- [ ] Crear `src/hooks/useOfflineSync.js` — hook de estado de sync
- [ ] Indicador visual de estado (synced / syncing / offline)

**Entregable:** Capa offline funcional (aún no conectada a componentes)

---

### Fase 6: Frontend — Migrar CRUD de planes
**Objetivo:** Plans usan API en vez de localStorage

- [ ] Refactorizar `WeeklyPlanner.js` para usar `syncEngine`
- [ ] Refactorizar handlers de planes en `App.js`
- [ ] Crear, renombrar, eliminar planes via API
- [ ] Agregar/editar/eliminar actividades de plan via API
- [ ] Activar plan, copiar plan via API
- [ ] Mantener undo/redo local (optimistic)

**Entregable:** Plans persisten en backend, funcionan offline

---

### Fase 7: Frontend — Migrar CRUD de weeks
**Objetivo:** Weeks usan API en vez de localStorage

- [ ] Refactorizar carga de semana para usar API
- [ ] Deploy de plan a semana via API
- [ ] Toggle completado, bloquear, mover, eliminar via API
- [ ] Quick Add via API (con sync_plan=true)
- [ ] Check-all / uncheck-all via API
- [ ] Navegación entre semanas carga desde API/IndexedDB

**Entregable:** Weeks persisten en backend, funcionan offline

---

### Fase 8: Frontend — Migrar todos, notes, resources, tags, preferences
**Objetivo:** Todo persiste en backend

- [ ] `TodoListModal` usa API para todos
- [ ] `DayDetailModal` carga/guarda notas via API
- [ ] `ResourcesModal` usa API para recursos
- [ ] Tags se obtienen de API
- [ ] Preferencias (estimated times, theme, sidebar) via API
- [ ] Statistics (FrequencyModal, CalendarModal) usan API

**Entregable:** Toda la data persiste en backend

---

### Fase 9: Script de migración
**Objetivo:** Migrar datos existentes de localStorage a Supabase

- [ ] Componente React temporal de migración
- [ ] Endpoint `POST /api/migrate`
- [ ] Reconciliación de dual storage
- [ ] Mapeo de IDs (localStorage → UUIDs) con fallback a `todo_inbox`
- [ ] Idempotencia por `migration_id`
- [ ] Verificación de integridad post-migración
- [ ] Limpieza de localStorage después de migración exitosa

**Entregable:** Usuarios existentes pueden migrar sus datos

---

### Fase 10: Limpieza
**Objetivo:** Eliminar código legacy

- [ ] Eliminar `src/auth/cryptoUtils.js`
- [ ] Eliminar `src/hooks/useLocalStorage.js`
- [ ] Eliminar todo `localStorage.getItem/setItem` de App.js
- [ ] Eliminar `src/data/defaultActivities.js` (ahora es seed en BD)
- [ ] Eliminar state muerto (`customActivities`, `updateCompletions`, etc.)
- [ ] Actualizar `.gitignore` para `.env`
- [ ] Actualizar `README.md`

**Entregable:** 0 localStorage, 100% backend

---

## 13. Estimación de tiempo

| Fase | Descripción | Días estimados |
|------|-------------|---------------|
| 0 | Setup infraestructura | 1 |
| 1 | Backend CRUD planes + actividades | 2-3 |
| 2 | Backend weeks + notes + todos + tags | 2-3 |
| 3 | Backend auth + stats + resources + preferences | 2-3 |
| 4 | Frontend Supabase Auth | 1-2 |
| 5 | Frontend Offline-first layer | 2-3 |
| 6 | Frontend migrar planes | 2 |
| 7 | Frontend migrar weeks | 2 |
| 8 | Frontend migrar todos/notes/resources | 1-2 |
| 9 | Script migración localStorage | 1 |
| 10 | Limpieza | 1 |
| | **Total** | **17-23 días** |

---

## 14. Limitaciones y consideraciones

### Vercel Serverless + Python

| Limitación | Detalle | Mitigación |
|------------|---------|------------|
| Cold starts | 1-3s si no hay tráfico | Keep-warm con cron, o aceptar latencia |
| Timeout | 10s (free), 60s (Pro) | Queries optimizadas con índices |
| Tamaño | 50MB máximo dependencias | Monitorear tamaño de deps Python |
| No WebSockets | Solo HTTP request/response | Usar Supabase Realtime directamente desde frontend |

### Offline-first

| Consideración | Detalle |
|---------------|---------|
| Conflict resolution | `op_id` idempotente + `base_revision`/`revision` |
| Datos iniciales | Primera carga descarga todo desde API → IndexedDB |
| Tamaño de IndexedDB | Sin límite práctico para datos de texto |
| Cola máxima | Limitar a 1000 operaciones pendientes |

### Supabase Free Tier

| Límite | Detalle |
|--------|---------|
| Database | 500 MB |
| Auth | 50,000 MAU |
| Storage | 1 GB |
| Realtime | 200 conexiones concurrentes |
| Edge Functions | 500K invocations/month |

---

## 15. Variables de entorno

### Backend (`api/.env` o Vercel Environment Variables)

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_JWKS_URL=https://xxxxx.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_ISSUER=https://xxxxx.supabase.co/auth/v1
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
ENVIRONMENT=production
```

### Frontend (`src/services/supabaseClient.js`)

```
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
REACT_APP_API_URL=/api
```

---

## 16. Bugs detectados en el app actual (se corrigen con la migración)

| Bug | Descripción | Cómo se corrige |
|-----|-------------|----------------|
| **Notes no persisten** | `handleSaveNotes` solo actualiza state en memoria | `week_notes` tabla las persiste |
| **Todos sin user scope** | `activity_todos` localStorage key es global | `activity_todos` con `user_id` + `week_activity_id`, fallback a `todo_inbox` |
| **Dual storage** | `studyPlannerData_*` y `week_*_*` duplican datos | Un solo source of truth en BD |
| **Sin auth real** | Username-only login sin password | Supabase Auth con email/password |
| **Sin cross-device** | Datos atrapados en localStorage de un browser | Sync via backend + IndexedDB |
| **`customActivities` dead state** | Declarado pero nunca usado | Se elimina en Fase 10 |
| **`updateCompletions` dead function** | Definida pero nunca llamada | Se elimina en Fase 10 |
| **`useLocalStorage` hook muerto** | Existe pero nunca se importa | Se elimina en Fase 10 |

---

*Documento generado: Abril 2026*
*Última actualización: Pendiente de revisión antes de implementación*
