from app.api.crud_router import crear_crud_router
from app.schemas.tipo_movimiento import (
    TipoMovimientoCreate,
    TipoMovimientoResponse,
    TipoMovimientoUpdate,
)
from app.services.catalogo_services import TipoMovimientoService

router = crear_crud_router(
    prefix="/tipos-movimiento",
    tag="Tipos de movimiento",
    service=TipoMovimientoService(),
    response_schema=TipoMovimientoResponse,
    create_schema=TipoMovimientoCreate,
    update_schema=TipoMovimientoUpdate,
)
