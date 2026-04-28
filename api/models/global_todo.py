from pydantic import BaseModel
from typing import Optional, List


class GlobalTodoCreate(BaseModel):
    id: str
    text: str
    completed: bool = False
    status: str = "todo"
    description: str = ""
    priority: str = "medium"
    tags: List[str] = []
    due_date: Optional[str] = None


class GlobalTodoUpdate(BaseModel):
    text: Optional[str] = None
    completed: Optional[bool] = None
    status: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None
    due_date: Optional[str] = None


class GlobalTodoBatch(BaseModel):
    todos: List[GlobalTodoCreate]
