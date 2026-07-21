"""
Servicio base genérico.

Contiene la lógica común de negocio para cualquier entidad:
listar con paginación, obtener, crear, actualizar y eliminar.
"""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel as PydanticModel
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.database.base import Base
from app.repositories.base_repository import BaseRepository

ModelType = TypeVar("ModelType", bound=Base)
CreateSchema = TypeVar("CreateSchema", bound=PydanticModel)
UpdateSchema = TypeVar("UpdateSchema", bound=PydanticModel)


class BaseService(Generic[ModelType, CreateSchema, UpdateSchema]):
    """
    Servicio genérico apoyado en un ``BaseRepository``.
    """

    #: Nombre legible de la entidad, usado en los mensajes de error.
    nombre_entidad: str = "Recurso"

    def __init__(
        self,
        model: type[ModelType],
        repository: BaseRepository[ModelType] | None = None,
    ):
        self.model = model
        self.repository = repository or BaseRepository(model)

    # ------------------------------------------------------------------
    # Lectura
    # ------------------------------------------------------------------

    def listar(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
        filtros: dict[str, Any] | None = None,
        order_by: str | None = None,
        order_dir: str = "desc",
    ):
        """
        Lista registros aplicando filtros, orden y paginación.
        """

        return self.repository.get_all(
            db,
            skip=skip,
            limit=limit,
            filtros=filtros,
            order_by=order_by,
            order_dir=order_dir,
        )

    def contar(
        self,
        db: Session,
        filtros: dict[str, Any] | None = None,
    ) -> int:
        """
        Cuenta los registros que cumplen los filtros.
        """

        return self.repository.count(db, filtros=filtros)

    def obtener_por_id(self, db: Session, id: int) -> ModelType:
        """
        Obtiene un registro o lanza ``NotFoundError``.
        """

        obj = self.repository.get_by_id(db, id)

        if obj is None:
            raise NotFoundError(
                f"{self.nombre_entidad} con id {id} no encontrado."
            )

        return obj

    # ------------------------------------------------------------------
    # Escritura
    # ------------------------------------------------------------------

    def crear(self, db: Session, datos: CreateSchema) -> ModelType:
        """
        Crea un nuevo registro.
        """

        obj = self.model(**datos.model_dump(exclude_unset=True))

        return self.repository.create(db, obj)

    def actualizar(
        self,
        db: Session,
        id: int,
        datos: UpdateSchema,
    ) -> ModelType:
        """
        Actualiza parcialmente un registro existente.
        """

        obj = self.obtener_por_id(db, id)

        for campo, valor in datos.model_dump(exclude_unset=True).items():
            setattr(obj, campo, valor)

        return self.repository.update(db, obj)

    def eliminar(self, db: Session, id: int) -> None:
        """
        Elimina lógicamente un registro.
        """

        obj = self.obtener_por_id(db, id)

        self.repository.delete(db, obj)
