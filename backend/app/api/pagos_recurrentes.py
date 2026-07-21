from typing import Any

from fastapi import Query

from app.api.crud_router import crear_crud_router
from app.schemas.pago_recurrente import (
    PagoRecurrenteCreate,
    PagoRecurrenteResponse,
    PagoRecurrenteUpdate,
)
from app.services.catalogo_services import PagoRecurrenteService


def filtros_pago_recurrente(
    categoria_id: int | None = Query(None),
    medio_pago_id: int | None = Query(None),
    activo: bool | None = Query(None),
) -> dict[str, Any]:
    """
    Filtros disponibles en el listado de pagos recurrentes.
    """

    return {
        "categoria_id": categoria_id,
        "medio_pago_id": medio_pago_id,
        "activo": activo,
    }


router = crear_crud_router(
    prefix="/pagos-recurrentes",
    tag="Pagos recurrentes",
    service=PagoRecurrenteService(),
    response_schema=PagoRecurrenteResponse,
    create_schema=PagoRecurrenteCreate,
    update_schema=PagoRecurrenteUpdate,
    filtros_dep=filtros_pago_recurrente,
)
