"""
Dependencias de autenticación.
"""

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.auth.security import CredencialesInvalidasError, leer_access_token
from app.database.session import get_db
from app.models.usuario import Usuario
from app.repositories.base_repository import BaseRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    Resuelve el usuario autenticado a partir del token JWT.
    """

    usuario_id = leer_access_token(token)

    usuario = BaseRepository(Usuario).get_by_id(db, usuario_id)

    if usuario is None:
        raise CredencialesInvalidasError(
            "El usuario del token ya no existe."
        )

    return usuario
