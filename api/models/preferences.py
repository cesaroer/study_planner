from pydantic import BaseModel
from typing import Optional


class PreferencesUpdate(BaseModel):
    active_plan_id: Optional[str] = None
    estimated_times: Optional[dict[str, str]] = None
    sidebar_collapsed: Optional[bool] = None
    theme: Optional[str] = None


class PreferencesResponse(BaseModel):
    user_id: str
    active_plan_id: Optional[str]
    estimated_times: dict[str, str]
    sidebar_collapsed: bool
    theme: str
    updated_at: str
