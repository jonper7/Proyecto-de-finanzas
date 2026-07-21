from typing import Any

from fastapi import Query

from app.api.crud_router import crear_crud_router
from app.schemas.presupuesto import (
    PresupuestoCreate,
    PresupuestoResponse,
    PresupuestoUpdate,
)
from app.services.catalogo_services import PresupuestoService


def filtros_presupuesto(
    usuario_id: int | None = Query(None),
    categoria_id: int | None = Query(None),
    mes: int | None = Query(None, ge=1, le=12),
    anio: int | None = Query(None, ge=2000, le=2100),
) -> dict[str, Any]:
    """
    Filtros disponibles en el listado de presupuestos.
    """

    return {
        "usuario_id": usuario_id,
        "categoria_id": categoria_id,
        "mes": mes,
        "anio": anio,
    }


router = crear_crud_router(
    prefix="/presupuestos",
    tag="Presupuestos",
    service=PresupuestoService(),
    response_schema=PresupuestoResponse,
    create_schema=PresupuestoCreate,
    update_schema=PresupuestoUpdate,
    filtros_dep=filtros_presupuesto,
)
