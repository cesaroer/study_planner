from pydantic import BaseModel
from typing import Optional


class WeekResponse(BaseModel):
    id: str
    user_id: str
    plan_id: Optional[str]
    week_start: str
    created_at: str
