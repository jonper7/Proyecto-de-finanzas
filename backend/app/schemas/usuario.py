from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UsuarioBase(BaseModel):
    nombre: str = Field(max_length=100)
    email: str | None = Field(
        default=None,
        max_length=150,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )


class UsuarioCreate(UsuarioBase):
    pass


class UsuarioUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=100)
    email: str | None = Field(
        default=None,
        max_length=150,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )


class UsuarioResponse(UsuarioBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
