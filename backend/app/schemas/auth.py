from pydantic import BaseModel


class Token(BaseModel):
    """
    Respuesta del endpoint de login.
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginRequest(BaseModel):
    """
    Credenciales enviadas en formato JSON.
    """

    email: str
    password: str
