"""
Servicios de los catálogos y entidades simples.

Todos reutilizan ``BaseService``; solo añaden las validaciones
propias de cada entidad.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationError
from app.models.categoria import Categoria
from app.models.medio_pago import MedioPago
from app.models.pago_recurrente import PagoRecurrente
from app.models.presupuesto import Presupuesto
from app.models.subcategoria import Subcategoria
from app.models.tipo_movimiento import TipoMovimiento
from app.models.usuario import Usuario
from app.repositories.base_repository import BaseRepository
from app.schemas.categoria import CategoriaCreate, CategoriaUpdate
from app.schemas.medio_pago import MedioPagoCreate, MedioPagoUpdate
from app.schemas.pago_recurrente import (
    PagoRecurrenteCreate,
    PagoRecurrenteUpdate,
)
from app.schemas.presupuesto import PresupuestoCreate, PresupuestoUpdate
from app.schemas.subcategoria import SubcategoriaCreate, SubcategoriaUpdate
from app.schemas.tipo_movimiento import (
    TipoMovimientoCreate,
    TipoMovimientoUpdate,
)
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate
from app.services.base_service import BaseService


def _validar_existe(
    db: Session,
    model,
    id: int | None,
    etiqueta: str,
) -> None:
    """
    Valida que exista un registro activo con ese identificador.
    """

    if id is None:
        return

    if not BaseRepository(model).exists(db, id):
        raise ValidationError(f"{etiqueta} {id} no existe.")


class TipoMovimientoService(
    BaseService[TipoMovimiento, TipoMovimientoCreate, TipoMovimientoUpdate]
):

    nombre_entidad = "Tipo de movimiento"

    def __init__(self):
        super().__init__(TipoMovimiento)


class CategoriaService(
    BaseService[Categoria, CategoriaCreate, CategoriaUpdate]
):

    nombre_entidad = "Categoría"

    def __init__(self):
        super().__init__(Categoria)

    def crear(self, db: Session, datos: CategoriaCreate) -> Categoria:

        _validar_existe(db, TipoMovimiento, datos.tipo_id, "El tipo")

        return super().crear(db, datos)

    def actualizar(
        self,
        db: Session,
        id: int,
        datos: CategoriaUpdate,
    ) -> Categoria:

        _validar_existe(db, TipoMovimiento, datos.tipo_id, "El tipo")

        return super().actualizar(db, id, datos)


class SubcategoriaService(
    BaseService[Subcategoria, SubcategoriaCreate, SubcategoriaUpdate]
):

    nombre_entidad = "Subcategoría"

    def __init__(self):
        super().__init__(Subcategoria)

    def crear(self, db: Session, datos: SubcategoriaCreate) -> Subcategoria:

        _validar_existe(db, Categoria, datos.categoria_id, "La categoría")

        return super().crear(db, datos)

    def actualizar(
        self,
        db: Session,
        id: int,
        datos: SubcategoriaUpdate,
    ) -> Subcategoria:

        _validar_existe(db, Categoria, datos.categoria_id, "La categoría")

        return super().actualizar(db, id, datos)


class MedioPagoService(
    BaseService[MedioPago, MedioPagoCreate, MedioPagoUpdate]
):

    nombre_entidad = "Medio de pago"

    def __init__(self):
        super().__init__(MedioPago)


class UsuarioService(BaseService[Usuario, UsuarioCreate, UsuarioUpdate]):

    nombre_entidad = "Usuario"

    def __init__(self):
        super().__init__(Usuario)

    def _validar_email_unico(
        self,
        db: Session,
        email: str | None,
        excluir_id: int | None = None,
    ) -> None:

        if not email:
            return

        stmt = select(Usuario).where(Usuario.email == email)

        if excluir_id is not None:
            stmt = stmt.where(Usuario.id != excluir_id)

        if db.execute(stmt).scalars().first() is not None:
            raise ConflictError(
                f"Ya existe un usuario con el email {email}."
            )

    def crear(self, db: Session, datos: UsuarioCreate) -> Usuario:

        self._validar_email_unico(db, datos.email)

        return super().crear(db, datos)

    def actualizar(
        self,
        db: Session,
        id: int,
        datos: UsuarioUpdate,
    ) -> Usuario:

        self._validar_email_unico(db, datos.email, excluir_id=id)

        return super().actualizar(db, id, datos)


class PresupuestoService(
    BaseService[Presupuesto, PresupuestoCreate, PresupuestoUpdate]
):

    nombre_entidad = "Presupuesto"

    def __init__(self):
        super().__init__(Presupuesto)

    def _validar_duplicado(
        self,
        db: Session,
        usuario_id: int,
        categoria_id: int,
        mes: int,
        anio: int,
        excluir_id: int | None = None,
    ) -> None:

        stmt = select(Presupuesto).where(
            Presupuesto.usuario_id == usuario_id,
            Presupuesto.categoria_id == categoria_id,
            Presupuesto.mes == mes,
            Presupuesto.anio == anio,
        )

        if excluir_id is not None:
            stmt = stmt.where(Presupuesto.id != excluir_id)

        if db.execute(stmt).scalars().first() is not None:
            raise ConflictError(
                "Ya existe un presupuesto para esa categoría y periodo."
            )

    def crear(self, db: Session, datos: PresupuestoCreate) -> Presupuesto:

        _validar_existe(db, Usuario, datos.usuario_id, "El usuario")
        _validar_existe(db, Categoria, datos.categoria_id, "La categoría")

        self._validar_duplicado(
            db,
            datos.usuario_id,
            datos.categoria_id,
            datos.mes,
            datos.anio,
        )

        return super().crear(db, datos)

    def actualizar(
        self,
        db: Session,
        id: int,
        datos: PresupuestoUpdate,
    ) -> Presupuesto:

        presupuesto = self.obtener_por_id(db, id)

        _validar_existe(db, Usuario, datos.usuario_id, "El usuario")
        _validar_existe(db, Categoria, datos.categoria_id, "La categoría")

        self._validar_duplicado(
            db,
            datos.usuario_id or presupuesto.usuario_id,
            datos.categoria_id or presupuesto.categoria_id,
            datos.mes or presupuesto.mes,
            datos.anio or presupuesto.anio,
            excluir_id=id,
        )

        return super().actualizar(db, id, datos)


class PagoRecurrenteService(
    BaseService[PagoRecurrente, PagoRecurrenteCreate, PagoRecurrenteUpdate]
):

    nombre_entidad = "Pago recurrente"

    def __init__(self):
        super().__init__(PagoRecurrente)

    def _validar_referencias(self, db: Session, datos) -> None:

        _validar_existe(db, Categoria, datos.categoria_id, "La categoría")
        _validar_existe(
            db, Subcategoria, datos.subcategoria_id, "La subcategoría"
        )
        _validar_existe(
            db, MedioPago, datos.medio_pago_id, "El medio de pago"
        )

    def crear(
        self,
        db: Session,
        datos: PagoRecurrenteCreate,
    ) -> PagoRecurrente:

        self._validar_referencias(db, datos)

        return super().crear(db, datos)

    def actualizar(
        self,
        db: Session,
        id: int,
        datos: PagoRecurrenteUpdate,
    ) -> PagoRecurrente:

        self._validar_referencias(db, datos)

        return super().actualizar(db, id, datos)
