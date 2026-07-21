from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PagoRecurrenteBase(BaseModel):
    descripcion: str = Field(max_length=150)
    categoria_id: int | None = None
    subcategoria_id: int | None = None
    medio_pago_id: int | None = None
    monto: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    dia_pago: int = Field(ge=1, le=31)
    activo: bool = True
    fecha_inicio: date | None = None
    fecha_fin: date | None = None


class PagoRecurrenteCreate(PagoRecurrenteBase):
    pass


class PagoRecurrenteUpdate(BaseModel):
    descripcion: str | None = Field(default=None, max_length=150)
    categoria_id: int | None = None
    subcategoria_id: int | None = None
    medio_pago_id: int | None = None
    monto: Decimal | None = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )
    dia_pago: int | None = Field(default=None, ge=1, le=31)
    activo: bool | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None


class PagoRecurrenteResponse(PagoRecurrenteBase):
    id: int
    ultima_generacion: date | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
