"""
Configuración de las pruebas.

Las pruebas usan SQLite en memoria con un esquema adjunto llamado
``transacciones``, de modo que no se necesita PostgreSQL para
ejecutarlas.
"""

import os

os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("SECRET_KEY", "clave-solo-para-pruebas")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import String, create_engine, event, text
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.auth.security import hashear_password
from app.database.session import get_db
from app.models.usuario import Usuario
from app.main import app as fastapi_app
import app.models  # noqa: F401


def _adaptar_modelos_a_sqlite() -> None:
    """
    SQLite no soporta ``gen_random_uuid()`` ni el tipo UUID nativo,
    así que el identificador se genera desde Python.
    """

    import uuid as uuid_lib

    from sqlalchemy.sql.schema import ColumnDefault

    from app.database.base import Base

    for tabla in Base.metadata.tables.values():

        columna = tabla.columns.get("uuid")

        if columna is None:
            continue

        columna.server_default = None
        columna.type = String(36)
        columna.default = ColumnDefault(lambda _: str(uuid_lib.uuid4()))


_adaptar_modelos_a_sqlite()


@pytest.fixture(scope="function")
def db_session():

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def adjuntar_esquema(dbapi_conn, _):
        dbapi_conn.execute("ATTACH DATABASE ':memory:' AS transacciones")

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()

    try:
        yield session
    finally:
        session.close()
        engine.dispose()


PASSWORD_PRUEBAS = "contrasena-de-prueba"


@pytest.fixture(scope="function")
def client_anonimo(db_session):
    """
    Cliente sin autenticar.
    """

    def override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = override_get_db

    with TestClient(fastapi_app) as test_client:
        yield test_client

    fastapi_app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def usuario(db_session):
    """
    Usuario con contraseña, creado directamente en la base.
    """

    
    registro = Usuario(
        nombre="Jonathan",
        email="jon@example.com",
        password_hash=hashear_password(PASSWORD_PRUEBAS),
    )

    db_session.add(registro)
    db_session.commit()
    db_session.refresh(registro)

    return registro


@pytest.fixture(scope="function")
def token(client_anonimo, usuario):
    """
    Token de acceso del usuario de pruebas.
    """

    respuesta = client_anonimo.post(
        "/auth/login",
        json={"email": usuario.email, "password": PASSWORD_PRUEBAS},
    )

    assert respuesta.status_code == 200, respuesta.text

    return respuesta.json()["access_token"]


@pytest.fixture(scope="function")
def crear_cliente(db_session):
    """
    Fábrica de clientes autenticados, cada uno independiente.
    """

    clientes = []

    def _crear(token: str | None = None) -> TestClient:

        def override_get_db():
            yield db_session

        fastapi_app.dependency_overrides[get_db] = override_get_db

        cliente = TestClient(fastapi_app)
        cliente.__enter__()

        if token is not None:
            cliente.headers.update({"Authorization": f"Bearer {token}"})

        clientes.append(cliente)

        return cliente

    yield _crear

    for cliente in clientes:
        cliente.__exit__(None, None, None)

    fastapi_app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def client(crear_cliente, token):
    """
    Cliente autenticado como el usuario principal.
    """

    return crear_cliente(token)


@pytest.fixture(scope="function")
def datos_base(client, usuario):
    """
    Crea el catálogo mínimo: tipo, categoría, subcategoría,
    medio de pago y usuario.
    """

    tipo = client.post(
        "/tipos-movimiento", json={"nombre": "Gasto"}
    ).json()

    categoria = client.post(
        "/categorias",
        json={"nombre": "Hogar", "tipo_id": tipo["id"]},
    ).json()

    subcategoria = client.post(
        "/subcategorias",
        json={"nombre": "Luz", "categoria_id": categoria["id"]},
    ).json()

    medio_pago = client.post(
        "/medios-pago", json={"nombre": "Efectivo"}
    ).json()

    return {
        "tipo": tipo,
        "categoria": categoria,
        "subcategoria": subcategoria,
        "medio_pago": medio_pago,
        "usuario": {"id": usuario.id, "email": usuario.email},
    }


@pytest.fixture
def otro_usuario(db_session):

    registro = Usuario(
        nombre="Otra persona",
        email="otra@example.com",
        password_hash=hashear_password("contrasena-ajena"),
    )

    db_session.add(registro)
    db_session.commit()
    db_session.refresh(registro)

    return registro


@pytest.fixture
def client_otro(crear_cliente, client_anonimo, otro_usuario):
    """
    Cliente autenticado como un usuario distinto.
    """

    respuesta = client_anonimo.post(
        "/auth/login",
        json={"email": otro_usuario.email, "password": "contrasena-ajena"},
    )

    return crear_cliente(respuesta.json()["access_token"])
