"""
Repositorio base genérico.

Encapsula las operaciones comunes de acceso a datos:
listar, obtener, crear, actualizar y eliminar (soft delete).
"""

from datetime import datetime
from typing import Any, Generic, Sequence, TypeVar

from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from app.database.base import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """
    Repositorio genérico sobre un modelo SQLAlchemy.

    Detecta automáticamente la estrategia de borrado lógico:

    - Si el modelo tiene ``deleted_at``  -> marca la fecha de borrado.
    - Si el modelo tiene ``activo``      -> lo pone en False.
    - En caso contrario                  -> borrado físico.
    """

    def __init__(self, model: type[ModelType]):
        self.model = model

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    @property
    def _tiene_deleted_at(self) -> bool:
        return hasattr(self.model, "deleted_at")

    @property
    def _tiene_activo(self) -> bool:
        return hasattr(self.model, "activo")

    def _base_query(self, incluir_eliminados: bool = False):
        """
        Construye el SELECT base excluyendo los registros borrados.
        """

        stmt = select(self.model)

        if not incluir_eliminados and self._tiene_deleted_at:
            stmt = stmt.where(self.model.deleted_at.is_(None))

        return stmt

    def _aplicar_filtros(self, stmt, filtros: dict[str, Any] | None):
        """
        Aplica filtros de igualdad simple sobre columnas existentes.

        Los valores ``None`` se ignoran.
        """

        if not filtros:
            return stmt

        for campo, valor in filtros.items():

            if valor is None:
                continue

            columna = getattr(self.model, campo, None)

            if columna is None:
                continue

            stmt = stmt.where(columna == valor)

        return stmt

    def _aplicar_orden(
        self,
        stmt,
        order_by: str | None,
        order_dir: str = "desc",
    ):
        """
        Aplica ordenamiento por nombre de columna.
        """

        if not order_by:
            return stmt

        columna = getattr(self.model, order_by, None)

        if columna is None:
            return stmt

        direccion = desc if order_dir.lower() == "desc" else asc

        return stmt.order_by(direccion(columna))

    # ------------------------------------------------------------------
    # Lectura
    # ------------------------------------------------------------------

    def get_all(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
        filtros: dict[str, Any] | None = None,
        order_by: str | None = None,
        order_dir: str = "desc",
        incluir_eliminados: bool = False,
    ) -> Sequence[ModelType]:
        """
        Lista registros con filtros, orden y paginación.
        """

        stmt = self._base_query(incluir_eliminados)
        stmt = self._aplicar_filtros(stmt, filtros)
        stmt = self._aplicar_orden(stmt, order_by, order_dir)
        stmt = stmt.offset(skip).limit(limit)

        return db.execute(stmt).scalars().all()

    def count(
        self,
        db: Session,
        filtros: dict[str, Any] | None = None,
        incluir_eliminados: bool = False,
    ) -> int:
        """
        Cuenta los registros que cumplen los filtros.
        """

        stmt = select(func.count()).select_from(self.model)

        if not incluir_eliminados and self._tiene_deleted_at:
            stmt = stmt.where(self.model.deleted_at.is_(None))

        stmt = self._aplicar_filtros(stmt, filtros)

        return db.execute(stmt).scalar_one()

    def get_by_id(
        self,
        db: Session,
        id: int,
        incluir_eliminados: bool = False,
    ) -> ModelType | None:
        """
        Obtiene un registro por su identificador.
        """

        stmt = self._base_query(incluir_eliminados).where(
            self.model.id == id
        )

        return db.execute(stmt).scalars().first()

    def exists(self, db: Session, id: int) -> bool:
        """
        Indica si existe un registro activo con ese identificador.
        """

        return self.get_by_id(db, id) is not None

    # ------------------------------------------------------------------
    # Escritura
    # ------------------------------------------------------------------

    def create(self, db: Session, obj: ModelType) -> ModelType:
        """
        Persiste un nuevo registro.
        """

        db.add(obj)
        db.commit()
        db.refresh(obj)

        return obj

    def update(self, db: Session, obj: ModelType) -> ModelType:
        """
        Guarda los cambios de un registro ya cargado en la sesión.
        """

        db.add(obj)
        db.commit()
        db.refresh(obj)

        return obj

    def delete(self, db: Session, obj: ModelType) -> ModelType | None:
        """
        Elimina un registro de forma lógica cuando el modelo lo permite.
        """

        if self._tiene_deleted_at:

            obj.deleted_at = datetime.now()

            if hasattr(obj, "sync_status"):
                obj.sync_status = "deleted"

            db.commit()
            db.refresh(obj)

            return obj

        if self._tiene_activo:

            obj.activo = False

            db.commit()
            db.refresh(obj)

            return obj

        db.delete(obj)
        db.commit()

        return None

    def hard_delete(self, db: Session, obj: ModelType) -> None:
        """
        Elimina físicamente un registro. Usar con precaución.
        """

        db.delete(obj)
        db.commit()
