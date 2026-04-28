from pydantic import BaseModel, Field
from typing import Optional


class ResourceCreate(BaseModel):
    title: str
    url: Optional[str] = None
    description: Optional[str] = None
    type: str = "link"
    tags: list[str] = Field(default_factory=list)


class ResourceUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None


class ResourceResponse(BaseModel):
    id: str
    title: str
    url: Optional[str]
    description: Optional[str]
    type: str
    tags: list[str]
    created_at: str
