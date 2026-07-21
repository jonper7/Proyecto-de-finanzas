"""
Schemas de la sincronización con la aplicación móvil.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.categoria import CategoriaResponse
from app.schemas.medio_pago import MedioPagoResponse
from app.schemas.movimiento import TipoMovimientoLiteral
from app.schemas.subcategoria import SubcategoriaResponse
from app.schemas.tipo_movimiento import TipoMovimientoResponse

EstadoSync = Literal[
    "creado",
    "actualizado",
    "eliminado",
    "ignorado_por_antiguedad",
    "error",
]


# ----------------------------------------------------------------------
# Envíos del dispositivo (push)
# ----------------------------------------------------------------------


class RegistroSync(BaseModel):
    """
    Campos comunes a todo registro que llega del dispositivo.
    """

    uuid: UUID
    device_updated_at: datetime
    eliminado: bool = False


class MovimientoSync(RegistroSync):
    fecha: date | None = None
    descripcion: str | None = Field(default=None, max_length=255)
    monto: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    tipo: TipoMovimientoLiteral | None = None
    subcategoria_id: int | None = None
    medio_pago_id: int | None = None
    comentario: str | None = None
    origen: str | None = Field(default="movil", max_length=20)


class PresupuestoSync(RegistroSync):
    categoria_id: int | None = None
    mes: int | None = Field(default=None, ge=1, le=12)
    anio: int | None = Field(default=None, ge=2000, le=2100)
    monto_limite: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )


class PagoRecurrenteSync(RegistroSync):
    descripcion: str | None = Field(default=None, max_length=150)
    categoria_id: int | None = None
    subcategoria_id: int | None = None
    medio_pago_id: int | None = None
    monto: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    dia_pago: int | None = Field(default=None, ge=1, le=31)
    activo: bool | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None


class PushRequest(BaseModel):
    """
    Lote de cambios generados en el dispositivo.
    """

    movimientos: list[MovimientoSync] = Field(default_factory=list)
    presupuestos: list[PresupuestoSync] = Field(default_factory=list)
    pagos_recurrentes: list[PagoRecurrenteSync] = Field(default_factory=list)


class ResultadoSync(BaseModel):
    """
    Qué ha hecho el servidor con cada registro recibido.
    """

    uuid: UUID
    estado: EstadoSync
    id: int | None = None
    mensaje: str | None = None


class PushResponse(BaseModel):
    server_time: datetime
    movimientos: list[ResultadoSync] = Field(default_factory=list)
    presupuestos: list[ResultadoSync] = Field(default_factory=list)
    pagos_recurrentes: list[ResultadoSync] = Field(default_factory=list)


# ----------------------------------------------------------------------
# Descargas hacia el dispositivo (pull)
# ----------------------------------------------------------------------


class MovimientoPull(BaseModel):
    uuid: UUID
    id: int
    fecha: date
    descripcion: str | None = None
    monto: Decimal
    tipo: str
    subcategoria_id: int
    medio_pago_id: int | None = None
    comentario: str | None = None
    origen: str | None = None
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PresupuestoPull(BaseModel):
    uuid: UUID
    id: int
    categoria_id: int
    mes: int
    anio: int
    monto_limite: Decimal
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PagoRecurrentePull(BaseModel):
    uuid: UUID
    id: int
    descripcion: str
    categoria_id: int | None = None
    subcategoria_id: int | None = None
    medio_pago_id: int | None = None
    monto: Decimal
    dia_pago: int
    activo: bool | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CatalogosPull(BaseModel):
    """
    Catálogos de solo lectura para el dispositivo.
    """

    tipos_movimiento: list[TipoMovimientoResponse] = Field(default_factory=list)
    categorias: list[CategoriaResponse] = Field(default_factory=list)
    subcategorias: list[SubcategoriaResponse] = Field(default_factory=list)
    medios_pago: list[MedioPagoResponse] = Field(default_factory=list)


class PullResponse(BaseModel):
    """
    Cambios ocurridos en el servidor desde el último cursor.

    ``server_time`` es el cursor que el dispositivo debe guardar y
    enviar en la siguiente descarga.
    """

    server_time: datetime
    desde: datetime | None = None
    movimientos: list[MovimientoPull] = Field(default_factory=list)
    presupuestos: list[PresupuestoPull] = Field(default_factory=list)
    pagos_recurrentes: list[PagoRecurrentePull] = Field(default_factory=list)
    catalogos: CatalogosPull = Field(default_factory=CatalogosPull)
