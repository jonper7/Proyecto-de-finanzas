"""
Endpoints de sincronización con la aplicación móvil.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.usuario import Usuario
from app.schemas.sync import PullResponse, PushRequest, PushResponse
from app.sync.service import SyncService

router = APIRouter(prefix="/sync", tags=["Sincronización"])

service = SyncService()


@router.get("/pull", response_model=PullResponse)
def pull(
    desde: datetime | None = Query(
        None,
        description=(
            "Cursor de la última sincronización: el server_time que "
            "devolvió la llamada anterior. Si se omite, se descarga todo."
        ),
    ),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Descarga los cambios ocurridos en el servidor.

    Incluye los registros borrados, para que el dispositivo pueda
    eliminarlos también en local.
    """

    return service.pull(db, usuario.id, desde)


@router.post("/push", response_model=PushResponse)
def push(
    lote: PushRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Envía al servidor los cambios hechos en el dispositivo.

    Cada registro se identifica por su uuid. Ante un conflicto se
    conserva la versión modificada más recientemente.
    """

    return service.push(db, usuario.id, lote)
