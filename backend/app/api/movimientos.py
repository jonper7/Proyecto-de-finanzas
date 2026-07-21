"""
Endpoints de movimientos.
"""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import paginacion
from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.usuario import Usuario
from app.schemas.common import Paginacion, PaginatedResponse
from app.schemas.movimiento import (
    MovimientoCreate,
    MovimientoFiltros,
    MovimientoResponse,
    MovimientoUpdate,
)
from app.services.movimiento_service import MovimientoService

router = APIRouter(prefix="/movimientos", tags=["Movimientos"])

service = MovimientoService()


def filtros_movimiento(
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    tipo: str | None = Query(None),
    categoria_id: int | None = Query(None),
    subcategoria_id: int | None = Query(None),
    medio_pago_id: int | None = Query(None),
    texto: str | None = Query(None, description="Busca en descripción y comentario."),
) -> MovimientoFiltros:
    """
    Construye el objeto de filtros del listado de movimientos.
    """

    return MovimientoFiltros(
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        tipo=tipo,
        categoria_id=categoria_id,
        subcategoria_id=subcategoria_id,
        medio_pago_id=medio_pago_id,
        texto=texto,
    )


@router.get("", response_model=PaginatedResponse[MovimientoResponse])
def listar_movimientos(
    db: Session = Depends(get_db),
    pag: Paginacion = Depends(paginacion),
    filtros: MovimientoFiltros = Depends(filtros_movimiento),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Lista los movimientos del usuario autenticado.
    """

    filtros.usuario_id = usuario.id

    items = service.listar(
        db,
        filtros=filtros,
        skip=pag.skip,
        limit=pag.limit,
        order_by=pag.order_by or "fecha",
        order_dir=pag.order_dir,
    )

    return PaginatedResponse[MovimientoResponse](
        total=service.contar(db, filtros=filtros),
        skip=pag.skip,
        limit=pag.limit,
        items=items,
    )


@router.get("/resumen")
def resumen_movimientos(
    db: Session = Depends(get_db),
    filtros: MovimientoFiltros = Depends(filtros_movimiento),
    usuario: Usuario = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Devuelve ingresos, gastos y balance del periodo filtrado.
    """

    filtros.usuario_id = usuario.id

    return service.resumen(db, filtros)


@router.get("/{id}", response_model=MovimientoResponse)
def obtener_movimiento(
    id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Obtiene un movimiento del usuario autenticado.
    """

    return service.obtener_del_usuario(db, id, usuario.id)


@router.post("", response_model=MovimientoResponse, status_code=201)
def crear_movimiento(
    datos: MovimientoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Crea un movimiento a nombre del usuario autenticado.
    """

    return service.crear(db, datos, usuario_id=usuario.id)


@router.put("/{id}", response_model=MovimientoResponse)
def actualizar_movimiento(
    id: int,
    datos: MovimientoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Actualiza un movimiento del usuario autenticado.
    """

    return service.actualizar(db, id, datos, usuario_id=usuario.id)


@router.delete("/{id}", status_code=204)
def eliminar_movimiento(
    id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Elimina lógicamente un movimiento del usuario autenticado.
    """

    service.eliminar(db, id, usuario_id=usuario.id)

    return Response(status_code=204)
