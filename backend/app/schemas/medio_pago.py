from pydantic import BaseModel, ConfigDict, Field


class MedioPagoBase(BaseModel):
    nombre: str = Field(max_length=50)
    activo: bool = True


class MedioPagoCreate(MedioPagoBase):
    pass


class MedioPagoUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=50)
    activo: bool | None = None


class MedioPagoResponse(MedioPagoBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
