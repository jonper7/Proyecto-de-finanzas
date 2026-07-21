from typing import Any

from fastapi import Query

from app.api.crud_router import crear_crud_router
from app.schemas.medio_pago import (
    MedioPagoCreate,
    MedioPagoResponse,
    MedioPagoUpdate,
)
from app.services.catalogo_services import MedioPagoService


def filtros_medio_pago(
    activo: bool | None = Query(None),
) -> dict[str, Any]:
    """
    Filtros disponibles en el listado de medios de pago.
    """

    return {"activo": activo}


router = crear_crud_router(
    prefix="/medios-pago",
    tag="Medios de pago",
    service=MedioPagoService(),
    response_schema=MedioPagoResponse,
    create_schema=MedioPagoCreate,
    update_schema=MedioPagoUpdate,
    filtros_dep=filtros_medio_pago,
)
