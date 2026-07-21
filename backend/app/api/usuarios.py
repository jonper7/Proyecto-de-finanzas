from app.api.crud_router import crear_crud_router
from app.schemas.usuario import (
    UsuarioCreate,
    UsuarioResponse,
    UsuarioUpdate,
)
from app.services.catalogo_services import UsuarioService

router = crear_crud_router(
    prefix="/usuarios",
    tag="Usuarios",
    service=UsuarioService(),
    response_schema=UsuarioResponse,
    create_schema=UsuarioCreate,
    update_schema=UsuarioUpdate,
)
