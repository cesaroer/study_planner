from pydantic import BaseModel
from typing import Optional


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
    updated_at: str


class TodoInboxResponse(BaseModel):
    id: str
    user_id: str
    source_identifier: str
    text: str
    reason: str
    reviewed: bool
    created_at: str
