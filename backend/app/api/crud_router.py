"""
Fábrica de routers CRUD.

Genera los cinco endpoints estándar (listar, obtener, crear,
actualizar, eliminar) para cualquier entidad que use ``BaseService``.
"""

from typing import Any, Callable, Type

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import paginacion
from app.database.session import get_db
from app.schemas.common import Paginacion, PaginatedResponse
from app.services.base_service import BaseService


def _sin_filtros() -> dict[str, Any]:
    return {}


def crear_crud_router(
    *,
    prefix: str,
    tag: str,
    service: BaseService,
    response_schema: Type[BaseModel],
    create_schema: Type[BaseModel],
    update_schema: Type[BaseModel],
    filtros_dep: Callable[..., dict[str, Any]] = _sin_filtros,
) -> APIRouter:
    """
    Construye un router CRUD completo.

    ``filtros_dep`` es una dependencia que devuelve un diccionario
    ``{columna: valor}`` con los filtros del listado.
    """

    router = APIRouter(prefix=prefix, tags=[tag])

    @router.get("", response_model=PaginatedResponse[response_schema])
    def listar(
        db: Session = Depends(get_db),
        pag: Paginacion = Depends(paginacion),
        filtros: dict = Depends(filtros_dep),
    ):
        """
        Lista los registros con filtros, orden y paginación.
        """

        items = service.listar(
            db,
            skip=pag.skip,
            limit=pag.limit,
            filtros=filtros,
            order_by=pag.order_by,
            order_dir=pag.order_dir,
        )

        return PaginatedResponse[response_schema](
            total=service.contar(db, filtros=filtros),
            skip=pag.skip,
            limit=pag.limit,
            items=items,
        )

    @router.get("/{id}", response_model=response_schema)
    def obtener(id: int, db: Session = Depends(get_db)):
        """
        Obtiene un registro por su identificador.
        """

        return service.obtener_por_id(db, id)

    @router.post("", response_model=response_schema, status_code=201)
    def crear(datos: create_schema, db: Session = Depends(get_db)):
        """
        Crea un nuevo registro.
        """

        return service.crear(db, datos)

    @router.put("/{id}", response_model=response_schema)
    def actualizar(
        id: int,
        datos: update_schema,
        db: Session = Depends(get_db),
    ):
        """
        Actualiza parcialmente un registro existente.
        """

        return service.actualizar(db, id, datos)

    @router.delete("/{id}", status_code=204)
    def eliminar(id: int, db: Session = Depends(get_db)):
        """
        Elimina el registro (borrado lógico cuando aplica).
        """

        service.eliminar(db, id)

        return Response(status_code=204)

    return router
