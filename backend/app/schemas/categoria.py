from pydantic import BaseModel, ConfigDict, Field


class CategoriaBase(BaseModel):
    nombre: str = Field(max_length=100)
    tipo_id: int
    icono: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    activo: bool = True


class CategoriaCreate(CategoriaBase):
    pass


class CategoriaUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=100)
    tipo_id: int | None = None
    icono: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    activo: bool | None = None


class CategoriaResponse(CategoriaBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
