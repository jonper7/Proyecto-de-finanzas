"""
Servicio de sincronización con la aplicación móvil.

Estrategia de conflictos: gana la última modificación. Se compara la
fecha declarada por el dispositivo (``device_updated_at``) con la que
el servidor tiene registrada (``updated_at``). Si la del dispositivo
es anterior, el cambio se descarta y se informa al cliente.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, ValidationError
from app.models.categoria import Categoria
from app.models.medio_pago import MedioPago
from app.models.movimiento import Movimiento
from app.models.pago_recurrente import PagoRecurrente
from app.models.presupuesto import Presupuesto
from app.models.subcategoria import Subcategoria
from app.models.tipo_movimiento import TipoMovimiento
from app.schemas.sync import (
    CatalogosPull,
    PullResponse,
    PushRequest,
    PushResponse,
    ResultadoSync,
)

# Campos que nunca se copian desde el dispositivo: los gestiona el
# servidor o identifican al propietario.
CAMPOS_RESERVADOS = {"uuid", "device_updated_at", "eliminado", "usuario_id"}

# Margen que se resta al cursor de descarga.
#
# updated_at se escribe con la hora de inicio de la transacción, así
# que una transacción que empieza antes de una descarga pero confirma
# después quedaría fuera del rango y su cambio se perdería para
# siempre. Con el margen, esos registros se reenvían en la siguiente
# descarga: el dispositivo puede recibir algo repetido, lo cual es
# inofensivo porque todo se identifica por uuid, pero nunca pierde un
# cambio.
MARGEN_CURSOR = timedelta(seconds=2)


def ahora_utc() -> datetime:
    """
    Marca de tiempo del servidor, sin zona horaria.

    Las columnas son TIMESTAMP WITHOUT TIME ZONE, así que se guarda
    todo en UTC y sin tzinfo para poder compararlo entre sí.
    """

    return datetime.now(timezone.utc).replace(tzinfo=None)


def a_utc_naive(momento: datetime | None) -> datetime | None:
    """
    Normaliza una fecha recibida del cliente a UTC sin zona horaria.

    El móvil puede enviar la fecha con desplazamiento (+02:00); si se
    guardara tal cual, las comparaciones con ``updated_at`` darían
    resultados incorrectos.
    """

    if momento is None:
        return None

    if momento.tzinfo is None:
        return momento

    return momento.astimezone(timezone.utc).replace(tzinfo=None)


class SyncService:

    # ------------------------------------------------------------------
    # Descarga
    # ------------------------------------------------------------------

    def pull(
        self,
        db: Session,
        usuario_id: int,
        desde: datetime | None = None,
    ) -> PullResponse:
        """
        Devuelve los cambios posteriores al cursor recibido.

        Se incluyen los registros borrados lógicamente para que el
        dispositivo pueda eliminarlos también en local.
        """

        # El cursor se toma ANTES de consultar: si algo se modifica
        # mientras se construye la respuesta, entrará en la siguiente
        # descarga en lugar de perderse.
        server_time = ahora_utc()

        desde = a_utc_naive(desde)

        if desde is not None:
            desde = desde - MARGEN_CURSOR

        def filtrar(consulta, modelo, propio: bool):

            if desde is not None:
                consulta = consulta.where(modelo.updated_at > desde)

            if propio:
                consulta = consulta.where(modelo.usuario_id == usuario_id)

            return consulta.order_by(modelo.updated_at)

        movimientos = db.execute(
            filtrar(select(Movimiento), Movimiento, propio=True)
        ).scalars().all()

        presupuestos = db.execute(
            filtrar(select(Presupuesto), Presupuesto, propio=True)
        ).scalars().all()

        pagos = db.execute(
            filtrar(select(PagoRecurrente), PagoRecurrente, propio=False)
        ).scalars().all()

        return PullResponse(
            server_time=server_time,
            desde=desde,
            movimientos=movimientos,
            presupuestos=presupuestos,
            pagos_recurrentes=pagos,
            catalogos=self._catalogos(db, desde),
        )

    def _catalogos(
        self,
        db: Session,
        desde: datetime | None,
    ) -> CatalogosPull:
        """
        Catálogos que el dispositivo solo descarga.
        """

        def consultar(modelo):

            consulta = select(modelo)

            if desde is not None:
                consulta = consulta.where(modelo.updated_at > desde)

            return db.execute(
                consulta.order_by(modelo.id)
            ).scalars().all()

        return CatalogosPull(
            tipos_movimiento=consultar(TipoMovimiento),
            categorias=consultar(Categoria),
            subcategorias=consultar(Subcategoria),
            medios_pago=consultar(MedioPago),
        )

    # ------------------------------------------------------------------
    # Subida
    # ------------------------------------------------------------------

    def push(
        self,
        db: Session,
        usuario_id: int,
        lote: PushRequest,
    ) -> PushResponse:
        """
        Aplica los cambios enviados por el dispositivo.
        """

        respuesta = PushResponse(server_time=ahora_utc())

        respuesta.movimientos = self._aplicar(
            db, Movimiento, lote.movimientos, usuario_id, propio=True
        )

        respuesta.presupuestos = self._aplicar(
            db, Presupuesto, lote.presupuestos, usuario_id, propio=True
        )

        respuesta.pagos_recurrentes = self._aplicar(
            db, PagoRecurrente, lote.pagos_recurrentes, usuario_id, propio=False
        )

        db.commit()

        return respuesta

    def _aplicar(
        self,
        db: Session,
        modelo,
        registros: list,
        usuario_id: int,
        propio: bool,
    ) -> list[ResultadoSync]:
        """
        Inserta o actualiza cada registro del lote.
        """

        resultados: list[ResultadoSync] = []

        for entrada in registros:

            try:
                # Savepoint por registro: si uno falla, se descarta
                # solo él y el resto del lote se conserva.
                with db.begin_nested():
                    resultados.append(
                        self._aplicar_uno(
                            db, modelo, entrada, usuario_id, propio
                        )
                    )

            except AppError as error:

                resultados.append(
                    ResultadoSync(
                        uuid=entrada.uuid,
                        estado="error",
                        mensaje=error.mensaje,
                    )
                )

            except Exception as error:  # noqa: BLE001

                resultados.append(
                    ResultadoSync(
                        uuid=entrada.uuid,
                        estado="error",
                        mensaje=str(error),
                    )
                )

        return resultados

    @staticmethod
    def _validar_referencias(db: Session, entrada) -> None:
        """
        Comprueba las claves foráneas antes de escribir.

        SQLite no impone claves foráneas por defecto, así que sin esta
        comprobación el mismo lote se comportaría distinto en las
        pruebas y en producción.
        """

        referencias = (
            ("subcategoria_id", Subcategoria, "La subcategoría"),
            ("categoria_id", Categoria, "La categoría"),
            ("medio_pago_id", MedioPago, "El medio de pago"),
        )

        for campo, modelo_referido, etiqueta in referencias:

            valor = getattr(entrada, campo, None)

            if valor is None:
                continue

            existe = db.execute(
                select(modelo_referido.id).where(
                    modelo_referido.id == valor
                )
            ).scalars().first()

            if existe is None:
                raise ValidationError(f"{etiqueta} {valor} no existe.")

    def _aplicar_uno(
        self,
        db: Session,
        modelo,
        entrada,
        usuario_id: int,
        propio: bool,
    ) -> ResultadoSync:

        self._validar_referencias(db, entrada)

        momento_dispositivo = a_utc_naive(entrada.device_updated_at)

        # El uuid viaja como texto: PostgreSQL lo convierte a su tipo
        # UUID nativo y SQLite (usado en las pruebas) lo guarda tal cual.
        uuid_texto = str(entrada.uuid)

        existente = db.execute(
            select(modelo).where(modelo.uuid == uuid_texto)
        ).scalars().first()

        # ---------------------------------------------------------
        # Alta
        # ---------------------------------------------------------
        if existente is None:

            if entrada.eliminado:
                # Se borró en el móvil sin haber llegado nunca al
                # servidor: no hay nada que hacer.
                return ResultadoSync(
                    uuid=entrada.uuid,
                    estado="eliminado",
                    mensaje="El registro no existía en el servidor.",
                )

            valores = self._valores(entrada)

            if propio:
                valores["usuario_id"] = usuario_id

            objeto = modelo(**valores)
            objeto.uuid = uuid_texto
            objeto.device_updated_at = momento_dispositivo
            objeto.sync_at = ahora_utc()
            objeto.sync_status = "synced"

            db.add(objeto)
            db.flush()

            return ResultadoSync(
                uuid=entrada.uuid,
                estado="creado",
                id=objeto.id,
            )

        # ---------------------------------------------------------
        # El registro pertenece a otro usuario
        # ---------------------------------------------------------
        if propio and existente.usuario_id != usuario_id:

            return ResultadoSync(
                uuid=entrada.uuid,
                estado="error",
                mensaje="El registro pertenece a otro usuario.",
            )

        # ---------------------------------------------------------
        # Conflicto: gana la modificación más reciente
        # ---------------------------------------------------------
        if (
            existente.updated_at is not None
            and momento_dispositivo is not None
            and momento_dispositivo < existente.updated_at
        ):

            return ResultadoSync(
                uuid=entrada.uuid,
                estado="ignorado_por_antiguedad",
                id=existente.id,
                mensaje=(
                    "El servidor tiene una versión más reciente; "
                    "descárgala con /sync/pull."
                ),
            )

        # ---------------------------------------------------------
        # Borrado propagado
        # ---------------------------------------------------------
        if entrada.eliminado:

            existente.deleted_at = ahora_utc()
            existente.sync_status = "deleted"
            existente.sync_at = ahora_utc()
            existente.device_updated_at = momento_dispositivo

            db.flush()

            return ResultadoSync(
                uuid=entrada.uuid,
                estado="eliminado",
                id=existente.id,
            )

        # ---------------------------------------------------------
        # Actualización
        # ---------------------------------------------------------
        for campo, valor in self._valores(entrada).items():
            setattr(existente, campo, valor)

        # Un registro que vuelve a enviarse deja de estar borrado.
        existente.deleted_at = None
        existente.device_updated_at = momento_dispositivo
        existente.sync_at = ahora_utc()
        existente.sync_status = "synced"

        db.flush()

        return ResultadoSync(
            uuid=entrada.uuid,
            estado="actualizado",
            id=existente.id,
        )

    @staticmethod
    def _valores(entrada) -> dict:
        """
        Campos del registro que sí se copian desde el dispositivo.
        """

        return {
            campo: valor
            for campo, valor in entrada.model_dump(
                exclude_unset=True
            ).items()
            if campo not in CAMPOS_RESERVADOS
        }
