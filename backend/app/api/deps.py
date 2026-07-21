"""
Dependencias comunes de la capa API.
"""

from fastapi import Query

from app.schemas.common import Paginacion


def paginacion(
    skip: int = Query(0, ge=0, description="Registros a omitir."),
    limit: int = Query(100, ge=1, le=500, description="Máximo de registros."),
    order_by: str | None = Query(None, description="Columna de ordenamiento."),
    order_dir: str = Query("desc", pattern="^(asc|desc)$"),
) -> Paginacion:
    """
    Inyecta los parámetros de paginación en los endpoints de listado.
    """

    return Paginacion(
        skip=skip,
        limit=limit,
        order_by=order_by,
        order_dir=order_dir,
    )
