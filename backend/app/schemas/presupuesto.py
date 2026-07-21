from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PresupuestoBase(BaseModel):
    usuario_id: int
    categoria_id: int
    mes: int = Field(ge=1, le=12)
    anio: int = Field(ge=2000, le=2100)
    monto_limite: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class PresupuestoCreate(PresupuestoBase):
    pass


class PresupuestoUpdate(BaseModel):
    usuario_id: int | None = None
    categoria_id: int | None = None
    mes: int | None = Field(default=None, ge=1, le=12)
    anio: int | None = Field(default=None, ge=2000, le=2100)
    monto_limite: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )


class PresupuestoResponse(PresupuestoBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
