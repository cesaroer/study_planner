from pydantic import BaseModel, Field
from typing import Optional


DAYS = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")
ACTIVITY_TYPES = (
    "Algoritmos",
    "Actividad Principal",
    "Secundaria",
    "Menor Prioridad",
    "Conocimiento Pasivo",
)


class PlanActivityCreate(BaseModel):
    dia: str
    actividad: str
    tipo: str
    icono: str = "📝"
    orden: int = 0
    tags: list[str] = Field(default_factory=list)


class PlanActivityUpdate(BaseModel):
    actividad: Optional[str] = None
    tipo: Optional[str] = None
    icono: Optional[str] = None
    orden: Optional[int] = None
    tags: Optional[list[str]] = None


class PlanActivityResponse(BaseModel):
    id: str
    plan_id: str
    dia: str
    actividad: str
    tipo: str
    icono: str
    orden: int
    tags: list[str]
    target_minutes: int
    created_at: str


class WeekActivityCreate(BaseModel):
    dia: str
    actividad: str
    tipo: str
    icono: str = "📝"
    orden: int = 0
    tags: list[str] = Field(default_factory=list)
    sync_plan: bool = False


class WeekActivityUpdate(BaseModel):
    actividad: Optional[str] = None
    tipo: Optional[str] = None
    icono: Optional[str] = None
    completado: Optional[bool] = None
    bloqueada: Optional[bool] = None
    tags: Optional[list[str]] = None
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
    tags: list[str]
    target_minutes: int
    spent_minutes: int
    pomodoro_sessions: int
    orden: int
    updated_at: str
