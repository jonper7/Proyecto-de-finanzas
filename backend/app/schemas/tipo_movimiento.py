from pydantic import BaseModel, ConfigDict, Field


class TipoMovimientoBase(BaseModel):
    nombre: str = Field(max_length=20)


class TipoMovimientoCreate(TipoMovimientoBase):
    pass


class TipoMovimientoUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=20)


class TipoMovimientoResponse(TipoMovimientoBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
