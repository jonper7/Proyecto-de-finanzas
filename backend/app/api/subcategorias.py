from typing import Any

from fastapi import Query

from app.api.crud_router import crear_crud_router
from app.schemas.subcategoria import (
    SubcategoriaCreate,
    SubcategoriaResponse,
    SubcategoriaUpdate,
)
from app.services.catalogo_services import SubcategoriaService


def filtros_subcategoria(
    categoria_id: int | None = Query(None),
    activo: bool | None = Query(None),
) -> dict[str, Any]:
    """
    Filtros disponibles en el listado de subcategorías.
    """

    return {"categoria_id": categoria_id, "activo": activo}


router = crear_crud_router(
    prefix="/subcategorias",
    tag="Subcategorías",
    service=SubcategoriaService(),
    response_schema=SubcategoriaResponse,
    create_schema=SubcategoriaCreate,
    update_schema=SubcategoriaUpdate,
    filtros_dep=filtros_subcategoria,
)
