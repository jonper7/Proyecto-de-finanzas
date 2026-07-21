"""
Utilidades de seguridad: hash de contraseñas y tokens JWT.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings
from app.core.exceptions import AppError


class CredencialesInvalidasError(AppError):
    """
    Usuario o contraseña incorrectos, o token no válido.
    """

    status_code = 401
    mensaje = "Credenciales no válidas."


# ----------------------------------------------------------------------
# Contraseñas
# ----------------------------------------------------------------------


def hashear_password(password: str) -> str:
    """
    Devuelve el hash bcrypt de una contraseña en texto plano.
    """

    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def verificar_password(password: str, password_hash: str | None) -> bool:
    """
    Comprueba una contraseña contra su hash.
    """

    if not password_hash:
        return False

    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        # El hash almacenado tiene un formato no reconocible.
        return False


# ----------------------------------------------------------------------
# Tokens
# ----------------------------------------------------------------------


def crear_access_token(usuario_id: int) -> str:
    """
    Genera un token de acceso firmado para el usuario indicado.
    """

    ahora = datetime.now(timezone.utc)

    payload = {
        "sub": str(usuario_id),
        "iat": ahora,
        "exp": ahora
        + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }

    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def leer_access_token(token: str) -> int:
    """
    Valida el token y devuelve el identificador del usuario.
    """

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )

    except jwt.ExpiredSignatureError:
        raise CredencialesInvalidasError("El token ha caducado.")

    except jwt.PyJWTError:
        raise CredencialesInvalidasError("El token no es válido.")

    sub = payload.get("sub")

    if sub is None:
        raise CredencialesInvalidasError("El token no identifica a ningún usuario.")

    try:
        return int(sub)
    except (TypeError, ValueError):
        raise CredencialesInvalidasError("El token no es válido.")
