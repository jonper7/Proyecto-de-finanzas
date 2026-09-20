"""
Endpoints de autenticación.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.security import (
    CredencialesInvalidasError,
    crear_access_token,
    verificar_password,
)
from app.core.config import settings
from app.database.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import LoginRequest, Token
from app.schemas.usuario import UsuarioResponse

router = APIRouter(prefix="/auth", tags=["Autenticación"])


def _autenticar(db: Session, email: str, password: str) -> Usuario:
    """
    Valida las credenciales y devuelve el usuario.
    """

    usuario = db.execute(
        select(Usuario).where(
            Usuario.email == email,
            Usuario.deleted_at.is_(None),
        )
    ).scalars().first()

    # Se comprueba la contraseña aunque el usuario no exista, para no
    # revelar qué correos están registrados por diferencia de tiempo.
    if usuario is None:
        verificar_password(password, None)
        raise CredencialesInvalidasError()

    if not verificar_password(password, usuario.password_hash):
        raise CredencialesInvalidasError()

    return usuario


def _token_para(usuario: Usuario) -> Token:

    return Token(
        access_token=crear_access_token(usuario.id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login", response_model=Token)
def login(
    datos: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Inicia sesión con email y contraseña en formato JSON.
    """

    return _token_para(_autenticar(db, datos.email, datos.password))


@router.post("/token", response_model=Token, include_in_schema=True)
def login_form(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Igual que /auth/login, pero con formulario OAuth2.

    Existe para que el botón «Authorize» de /docs funcione.
    El campo «username» es el email.
    """

    return _token_para(_autenticar(db, form.username, form.password))


@router.get("/me", response_model=UsuarioResponse)
def usuario_actual(usuario: Usuario = Depends(get_current_user)):
    """
    Devuelve el usuario correspondiente al token enviado.
    """

    return usuario


# ----------------------------------------------------------------------
# Acceso local (sin contraseña)
#
# Pensado para uso personal en la propia máquina: entra a partir del
# correo. Solo responde a peticiones que vienen de localhost, así que
# desde la red no se puede usar. Si algún día la aplicación se abre a
# más gente, este endpoint se retira y se vuelve al flujo con
# contraseña.
# ----------------------------------------------------------------------

_LOCALHOST = {"127.0.0.1", "::1", "localhost"}


class LoginLocalRequest(BaseModel):
    usuario: str


@router.post("/login-local", response_model=Token)
def login_local(
    datos: LoginLocalRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Inicia sesión con solo el nombre de usuario desde la propia máquina.
    """

    cliente = request.client.host if request.client else None

    if cliente not in _LOCALHOST:
        raise HTTPException(
            status_code=403,
            detail="Solo disponible desde la propia máquina.",
        )

    nombre = datos.usuario.strip()

    # Coincide por nombre exacto (sin distinguir mayúsculas/minúsculas)
    # y, como cortesía, también por email por si alguien lo escribe.
    usuario = db.execute(
        select(Usuario).where(
            (func.lower(Usuario.nombre) == nombre.lower())
            | (func.lower(Usuario.email) == nombre.lower()),
            Usuario.deleted_at.is_(None),
        )
    ).scalars().first()

    if usuario is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe un usuario con el nombre «{nombre}».",
        )

    return _token_para(usuario)
