from pydantic import BaseModel


class NoteUpdate(BaseModel):
    content: str


class NoteResponse(BaseModel):
    id: str
    week_id: str
    dia: str
    content: str
    updated_at: str
