# Study Planner — Roadmap Operativo (Local-First)

Aplicación de planificación de estudio enfocada en ejecución diaria, consistencia semanal y UX minimalista dark.

Este roadmap está diseñado para implementarse sin servicios externos en esta etapa.

## Estado actual del roadmap
- `Fase 1`: en progreso avanzado (implementada base funcional).
- `Fase 2-7`: pendientes.
- `Backlog`: definido.

## Convenciones de datos (compatibilidad backward)
Las actividades se extienden de forma no disruptiva:
- `tags: string[]` (default `[]`)
- `targetMinutes: number` (default `0`)
- `spentMinutes: number` (default `0`)
- `pomodoroSessions: number` (default `0`)

Si una actividad antigua no trae esos campos, se normaliza al cargar.

## Fases de implementación

### Fase 1 — Productividad base del dashboard
Objetivo: crear, encontrar y ejecutar tareas en segundos.

Checklist implementado:
- [x] Quick Add con botón flotante (FAB).
- [x] Quick Add en modal compacto.
- [x] Quick Add con nombre, tipo, día.
- [x] Quick Add con emoji/ícono editable (input + presets).
- [x] Quick Add con etiquetas sugeridas + custom por texto.
- [x] Búsqueda instantánea por actividad, tipo y etiqueta.
- [x] Filtros por etiquetas.
- [x] Búsqueda/filtros movidos a botón flotante con modal (para no sobrecargar pantalla).
- [x] Modo enfoque (una tarea visible + siguiente sugerida automática por prioridad).
- [x] Botones de historial `undo/redo`.
- [x] Historial para mutaciones de actividades (crear/editar/toggle/eliminar/check all/uncheck all).
- [x] Límite de historial de 50 snapshots.

Pendiente de Fase 1:
- [ ] Afinar UX de Quick Add para paridad completa con flujo de alta en Ajustes (detalles visuales y microinteracciones).
- [ ] Reducir warnings técnicos legacy no relacionados a producto.

Definición de terminado de Fase 1:
- Flujo principal diario usable desde dashboard sin abrir modales pesados.
- Sin regresiones en CRUD actual.

---

### Fase 2 — Reprogramación rápida de pendientes
Objetivo: mover tareas pendientes sin fricción.

Checklist:
- [x] Acción rápida `Mover a mañana` (menú contextual por actividad).
- [x] Acción rápida `Mover al próximo lunes` (menú contextual por actividad).
- [x] Arrastrar y soltar entre días (misma semana actual).
- [x] Reprogramación entra al historial `undo/redo`.
- [ ] Mantener tipo, tags, tiempo objetivo y progreso al mover.

---

### Fase 3 — Vistas de planificación
Objetivo: alternar entre planificación semanal y ejecución inmediata.

Checklist:
- [ ] Cambiar entre `Vista semanal` y `Vista Hoy + Próximos 7 días`.
- [ ] Volver de `Hoy+7` a semanal sin perder contexto.
- [ ] Persistir vista seleccionada por usuario.
- [ ] Mantener coherencia de conteos entre vistas.

---

### Fase 4 — Pomodoro por actividad con objetivo de tiempo
Objetivo: medir trabajo real por actividad.

Checklist:
- [ ] Temporizador Pomodoro por actividad.
- [ ] Contador de sesiones por actividad.
- [ ] Campo de `tiempo objetivo` por actividad.
- [ ] Track de `% completado` de objetivo (`spentMinutes / targetMinutes`).
- [ ] Estado visual de avance por actividad.

---

### Fase 5 — Capacidad diaria y bienvenida
Objetivo: evitar sobrecarga y mejorar onboarding diario.

Checklist:
- [ ] Carga estimada por día en minutos (barra de capacidad).
- [ ] Configuración de capacidad diaria en pantalla `Usuario` (o equivalente).
- [ ] Refactor de sección de bienvenida a versión minimal.
- [ ] Frase motivadora del día integrada en bienvenida, sin sobrecarga visual.

---

### Fase 6 — Motivación, consistencia y cierre semanal
Objetivo: convertir seguimiento en sistema de hábito.

Checklist:
- [ ] Logros simples (`7 días seguidos`, `100 tareas completadas`, etc.).
- [ ] Notas rápidas por día + bloque de reflexión (`qué funcionó`, `qué mejorar`).
- [ ] Racha actual + `% de consistencia semanal`.
- [ ] Evolucionar modal de frecuencia a página completa de consistencia/habit tracker.
- [ ] Checklist de cierre semanal automático: completadas, faltantes, mejor día.

---

### Fase 7 — Planificador Semanal/Mensual
Objetivo: reemplazar la vista de actividades con un planificador visual flexible.

Checklist:
- [ ] Nueva vista "Planificador" accesible desde menú lateral.
- [ ] Grid semanal con días editables (reemplaza vista actual de actividades).
- [ ] Switch para alternar entre vista "Semanal" y "Mensual".
- [ ] Placeholders vacíos en días sin actividades con botón "Agregar".
- [ ] Al hacer click en "Agregar" se abre modal para crear/editar actividad.
- [ ] Las actividades planificadas se muestran en el grid correspondiente.
- [ ] Persistencia en localStorage de actividades planificadas.
- [ ] Integración con sistema de actividades existente (mismas actividades, no duplicado).
- [ ] Indicador visual de mes actual en vista mensual.
- [ ] Navegación entre semanas/meses en el planificador.

## Backlog (por explorar después)
- [ ] Plantillas de semana (`Backend`, `Frontend`, `Entrevistas`, `Universidad`).

## Pruebas mínimas por fase
1. Alta rápida con y sin etiquetas, incluyendo emoji personalizado.
2. Filtros combinados (texto + tags) sin romper conteos base.
3. Modo enfoque con sugerencia coherente.
4. Undo/redo encadenado en mutaciones reales.
5. Responsive desktop/tablet/móvil sin overlaps.
6. Compatibilidad con datos antiguos (migración implícita de campos nuevos).
7. Switch semanal/mensual sin perder actividades planificadas.
8. Persistencia de actividades planificadas al recargar página.

## Setup del proyecto
```bash
npm install
npm start
```

Build de producción:
```bash
npm run build
```
