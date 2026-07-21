"""
Repositorio de movimientos.

Extiende el repositorio base con los filtros propios del dominio:
rango de fechas, búsqueda por texto y filtro por categoría.
"""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.movimiento import Movimiento
from app.models.subcategoria import Subcategoria
from app.repositories.base_repository import BaseRepository
from app.schemas.movimiento import MovimientoFiltros


class MovimientoRepository(BaseRepository[Movimiento]):

    def __init__(self):
        super().__init__(Movimiento)

    # ------------------------------------------------------------------
    # Filtros de dominio
    # ------------------------------------------------------------------

    def _aplicar_filtros_movimiento(self, stmt, filtros: MovimientoFiltros | None):

        if filtros is None:
            return stmt

        if filtros.fecha_desde is not None:
            stmt = stmt.where(Movimiento.fecha >= filtros.fecha_desde)

        if filtros.fecha_hasta is not None:
            stmt = stmt.where(Movimiento.fecha <= filtros.fecha_hasta)

        if filtros.tipo is not None:
            stmt = stmt.where(Movimiento.tipo == filtros.tipo)

        if filtros.subcategoria_id is not None:
            stmt = stmt.where(
                Movimiento.subcategoria_id == filtros.subcategoria_id
            )

        if filtros.medio_pago_id is not None:
            stmt = stmt.where(
                Movimiento.medio_pago_id == filtros.medio_pago_id
            )

        if filtros.usuario_id is not None:
            stmt = stmt.where(Movimiento.usuario_id == filtros.usuario_id)

        if filtros.categoria_id is not None:
            stmt = stmt.join(
                Subcategoria,
                Subcategoria.id == Movimiento.subcategoria_id,
            ).where(Subcategoria.categoria_id == filtros.categoria_id)

        if filtros.texto:

            patron = f"%{filtros.texto}%"

            stmt = stmt.where(
                or_(
                    Movimiento.descripcion.ilike(patron),
                    Movimiento.comentario.ilike(patron),
                )
            )

        return stmt

    # ------------------------------------------------------------------
    # Lectura
    # ------------------------------------------------------------------

    def listar(
        self,
        db: Session,
        filtros: MovimientoFiltros | None = None,
        skip: int = 0,
        limit: int = 100,
        order_by: str | None = "fecha",
        order_dir: str = "desc",
    ):
        """
        Lista movimientos activos aplicando filtros, orden y paginación.
        """

        stmt = self._base_query()
        stmt = self._aplicar_filtros_movimiento(stmt, filtros)
        stmt = self._aplicar_orden(stmt, order_by or "fecha", order_dir)
        stmt = stmt.order_by(Movimiento.id.desc())
        stmt = stmt.offset(skip).limit(limit)
        stmt = stmt.options(
            selectinload(Movimiento.subcategoria),
            selectinload(Movimiento.medio_pago),
        )

        return db.execute(stmt).scalars().unique().all()

    def contar(
        self,
        db: Session,
        filtros: MovimientoFiltros | None = None,
    ) -> int:
        """
        Cuenta los movimientos activos que cumplen los filtros.
        """

        stmt = select(Movimiento.id).where(Movimiento.deleted_at.is_(None))
        stmt = self._aplicar_filtros_movimiento(stmt, filtros)

        return db.execute(
            select(func.count()).select_from(stmt.subquery())
        ).scalar_one()

    def resumen_por_tipo(
        self,
        db: Session,
        filtros: MovimientoFiltros | None = None,
    ):
        """
        Devuelve el total acumulado por tipo de movimiento.
        """

        stmt = select(
            Movimiento.tipo,
            func.coalesce(func.sum(Movimiento.monto), 0),
        ).where(Movimiento.deleted_at.is_(None))

        stmt = self._aplicar_filtros_movimiento(stmt, filtros)
        stmt = stmt.group_by(Movimiento.tipo)

        return db.execute(stmt).all()
