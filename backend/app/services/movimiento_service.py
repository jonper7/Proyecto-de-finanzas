"""
Lógica de negocio de los movimientos.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import TIPO_GASTO, TIPO_INGRESO
from app.core.exceptions import NotFoundError
from app.core.exceptions import ValidationError
from app.models.medio_pago import MedioPago
from app.models.movimiento import Movimiento
from app.models.subcategoria import Subcategoria
from app.repositories.base_repository import BaseRepository
from app.repositories.movimiento_repository import MovimientoRepository
from app.schemas.movimiento import (
    MovimientoCreate,
    MovimientoFiltros,
    MovimientoUpdate,
)
from app.services.base_service import BaseService


class MovimientoService(
    BaseService[Movimiento, MovimientoCreate, MovimientoUpdate]
):

    nombre_entidad = "Movimiento"

    def __init__(self):
        super().__init__(Movimiento, MovimientoRepository())
        self.repository: MovimientoRepository
        self._subcategorias = BaseRepository(Subcategoria)
        self._medios_pago = BaseRepository(MedioPago)

    # ------------------------------------------------------------------
    # Validaciones
    # ------------------------------------------------------------------

    def _validar_referencias(
        self,
        db: Session,
        subcategoria_id: int | None,
        medio_pago_id: int | None,
    ) -> None:
        """
        Comprueba que las claves foráneas apunten a registros existentes.
        """

        if subcategoria_id is not None:

            if not self._subcategorias.exists(db, subcategoria_id):
                raise ValidationError(
                    f"La subcategoría {subcategoria_id} no existe."
                )

        if medio_pago_id is not None:

            if not self._medios_pago.exists(db, medio_pago_id):
                raise ValidationError(
                    f"El medio de pago {medio_pago_id} no existe."
                )

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
        Lista movimientos con filtros, orden y paginación.
        """

        return self.repository.listar(
            db,
            filtros=filtros,
            skip=skip,
            limit=limit,
            order_by=order_by,
            order_dir=order_dir,
        )

    def contar(
        self,
        db: Session,
        filtros: MovimientoFiltros | None = None,
    ) -> int:

        return self.repository.contar(db, filtros=filtros)

    def resumen(
        self,
        db: Session,
        filtros: MovimientoFiltros | None = None,
    ) -> dict:
        """
        Calcula ingresos, gastos y balance del periodo filtrado.
        """

        totales = {
            fila[0]: Decimal(fila[1])
            for fila in self.repository.resumen_por_tipo(db, filtros)
        }

        ingresos = totales.get(TIPO_INGRESO, Decimal("0"))
        gastos = totales.get(TIPO_GASTO, Decimal("0"))

        return {
            "ingresos": ingresos,
            "gastos": gastos,
            "balance": ingresos - gastos,
        }

    # ------------------------------------------------------------------
    # Escritura
    # ------------------------------------------------------------------

    def obtener_del_usuario(
        self,
        db: Session,
        id: int,
        usuario_id: int,
    ) -> Movimiento:
        """
        Obtiene un movimiento comprobando que pertenezca al usuario.

        Devuelve 404 (y no 403) cuando el movimiento es de otro
        usuario, para no revelar qué identificadores existen.
        """

        movimiento = self.obtener_por_id(db, id)

        if movimiento.usuario_id != usuario_id:
            raise NotFoundError(
                f"{self.nombre_entidad} con id {id} no encontrado."
            )

        return movimiento

    def crear(
        self,
        db: Session,
        datos: MovimientoCreate,
        usuario_id: int,
    ) -> Movimiento:
        """
        Crea un movimiento a nombre del usuario indicado.
        """

        self._validar_referencias(
            db,
            datos.subcategoria_id,
            datos.medio_pago_id,
        )

        valores = datos.model_dump()

        # El propietario lo decide el token, nunca el cuerpo de la
        # petición: así un cliente no puede crear movimientos ajenos.
        valores["usuario_id"] = usuario_id

        movimiento = Movimiento(**valores)
        movimiento.sync_status = "pending"

        return self.repository.create(db, movimiento)

    def actualizar(
        self,
        db: Session,
        id: int,
        datos: MovimientoUpdate,
        usuario_id: int,
    ) -> Movimiento:
        """
        Actualiza un movimiento del usuario indicado.
        """

        movimiento = self.obtener_del_usuario(db, id, usuario_id)

        cambios = datos.model_dump(exclude_unset=True)

        self._validar_referencias(
            db,
            cambios.get("subcategoria_id"),
            cambios.get("medio_pago_id"),
        )

        for campo, valor in cambios.items():
            setattr(movimiento, campo, valor)

        movimiento.sync_status = "pending"

        return self.repository.update(db, movimiento)

    def eliminar(
        self,
        db: Session,
        id: int,
        usuario_id: int,
    ) -> None:
        """
        Elimina lógicamente un movimiento del usuario indicado.
        """

        movimiento = self.obtener_del_usuario(db, id, usuario_id)

        self.repository.delete(db, movimiento)
