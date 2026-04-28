from pydantic import BaseModel
from typing import Optional


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
    by_type: dict[str, FrequencyEntry]


class OverviewResponse(BaseModel):
    total_activities: int
    total_completed: int
    completion_rate: float
    total_weeks: int
    most_productive_day: str
    avg_per_week: float
