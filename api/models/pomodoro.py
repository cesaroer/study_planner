from pydantic import BaseModel
from typing import Optional


class PomodoroSessionCreate(BaseModel):
    id: str
    week_activity_id: Optional[str] = None
    activity_name: str
    activity_type: Optional[str] = None
    duration_minutes: int = 25
    phase: str = "work"


class PomodoroSessionResponse(BaseModel):
    id: str
    user_id: str
    week_activity_id: Optional[str]
    activity_name: str
    activity_type: Optional[str]
    duration_minutes: int
    phase: str
    completed_at: str
