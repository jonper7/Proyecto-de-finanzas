from datetime import datetime, timedelta, timezone

import jwt

from tests.conftest import PASSWORD_PRUEBAS


def test_login_correcto(client_anonimo, usuario):

    respuesta = client_anonimo.post(
        "/auth/login",
        json={"email": usuario.email, "password": PASSWORD_PRUEBAS},
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["token_type"] == "bearer"
    assert respuesta.json()["access_token"]


def test_login_password_incorrecta(client_anonimo, usuario):

    respuesta = client_anonimo.post(
        "/auth/login",
        json={"email": usuario.email, "password": "no-es-la-buena"},
    )

    assert respuesta.status_code == 401


def test_login_usuario_inexistente(client_anonimo, usuario):

    respuesta = client_anonimo.post(
        "/auth/login",
        json={"email": "nadie@example.com", "password": PASSWORD_PRUEBAS},
    )

    assert respuesta.status_code == 401


def test_login_por_formulario(client_anonimo, usuario):
    """
    El endpoint que usa el botón Authorize de /docs.
    """

    respuesta = client_anonimo.post(
        "/auth/token",
        data={"username": usuario.email, "password": PASSWORD_PRUEBAS},
    )

    assert respuesta.status_code == 200


def test_endpoints_protegidos(client_anonimo):

    assert client_anonimo.get("/movimientos").status_code == 401
    assert client_anonimo.get("/categorias").status_code == 401
    assert client_anonimo.get("/auth/me").status_code == 401


def test_endpoints_publicos(client_anonimo):

    assert client_anonimo.get("/").status_code == 200


def test_token_invalido(client_anonimo):

    respuesta = client_anonimo.get(
        "/auth/me",
        headers={"Authorization": "Bearer esto-no-es-un-token"},
    )

    assert respuesta.status_code == 401


def test_token_caducado(client_anonimo, usuario):

    pasado = datetime.now(timezone.utc) - timedelta(minutes=5)

    token = jwt.encode(
        {"sub": str(usuario.id), "iat": pasado, "exp": pasado},
        "clave-solo-para-pruebas",
        algorithm="HS256",
    )

    respuesta = client_anonimo.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 401
    assert "caducado" in respuesta.json()["detail"].lower()


def test_token_firmado_con_otra_clave(client_anonimo, usuario):

    token = jwt.encode(
        {"sub": str(usuario.id)},
        "clave-del-atacante",
        algorithm="HS256",
    )

    respuesta = client_anonimo.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 401


def test_me_devuelve_el_usuario(client, usuario):

    respuesta = client.get("/auth/me")

    assert respuesta.status_code == 200
    assert respuesta.json()["email"] == usuario.email
    assert "password_hash" not in respuesta.json()
