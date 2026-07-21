"""
Endpoints de autenticación.
"""

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
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
