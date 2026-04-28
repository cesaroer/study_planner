from pydantic import BaseModel, Field
from typing import Optional


class PlanCreate(BaseModel):
    name: str


class PlanUpdate(BaseModel):
    name: str


class PlanResponse(BaseModel):
    id: str
    user_id: str
    name: str
    is_default: bool
    is_active: bool
    created_at: str
    updated_at: str
