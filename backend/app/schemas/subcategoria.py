from pydantic import BaseModel, ConfigDict, Field


class SubcategoriaBase(BaseModel):
    nombre: str = Field(max_length=100)
    categoria_id: int
    activo: bool = True


class SubcategoriaCreate(SubcategoriaBase):
    pass


class SubcategoriaUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=100)
    categoria_id: int | None = None
    activo: bool | None = None


class SubcategoriaResponse(SubcategoriaBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
