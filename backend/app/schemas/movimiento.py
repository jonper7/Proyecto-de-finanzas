from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import UUID4, BaseModel, ConfigDict, Field

from app.core.constants import TIPO_GASTO, TIPO_INGRESO

TipoMovimientoLiteral = Literal[TIPO_INGRESO, TIPO_GASTO]


class MovimientoBase(BaseModel):
    fecha: date
    descripcion: str | None = Field(default=None, max_length=255)
    monto: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    tipo: TipoMovimientoLiteral
    subcategoria_id: int
    medio_pago_id: int | None = None
    comentario: str | None = None


class MovimientoCreate(MovimientoBase):
    # El propietario no se envía: sale siempre del token de acceso.
    pass


class MovimientoUpdate(BaseModel):
    fecha: date | None = None
    descripcion: str | None = Field(default=None, max_length=255)
    monto: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )
    tipo: TipoMovimientoLiteral | None = None
    subcategoria_id: int | None = None
    medio_pago_id: int | None = None
    comentario: str | None = None


class MovimientoResponse(MovimientoBase):
    id: int
    usuario_id: int | None = None
    uuid: UUID4 | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None
    sync_status: str | None = None
    origen: str | None = None

    model_config = ConfigDict(from_attributes=True)


class MovimientoFiltros(BaseModel):
    """
    Filtros disponibles para el listado de movimientos.
    """

    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    tipo: TipoMovimientoLiteral | None = None
    subcategoria_id: int | None = None
    categoria_id: int | None = None
    medio_pago_id: int | None = None
    usuario_id: int | None = None
    texto: str | None = None
