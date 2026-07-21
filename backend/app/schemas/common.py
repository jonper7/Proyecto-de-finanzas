"""
Schemas compartidos: paginación y respuestas genéricas.
"""

from typing import Generic, Sequence, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Paginacion(BaseModel):
    """
    Parámetros de paginación y ordenamiento.
    """

    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=500)
    order_by: str | None = None
    order_dir: str = Field(default="desc", pattern="^(asc|desc)$")


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Respuesta paginada estándar.
    """

    total: int
    skip: int
    limit: int
    items: Sequence[T]
