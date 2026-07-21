from typing import Any

from fastapi import Query

from app.api.crud_router import crear_crud_router
from app.schemas.categoria import (
    CategoriaCreate,
    CategoriaResponse,
    CategoriaUpdate,
)
from app.services.catalogo_services import CategoriaService


def filtros_categoria(
    tipo_id: int | None = Query(None),
    activo: bool | None = Query(None),
) -> dict[str, Any]:
    """
    Filtros disponibles en el listado de categorías.
    """

    return {"tipo_id": tipo_id, "activo": activo}


router = crear_crud_router(
    prefix="/categorias",
    tag="Categorías",
    service=CategoriaService(),
    response_schema=CategoriaResponse,
    create_schema=CategoriaCreate,
    update_schema=CategoriaUpdate,
    filtros_dep=filtros_categoria,
)
