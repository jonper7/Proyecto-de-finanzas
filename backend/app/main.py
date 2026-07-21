"""
Punto de entrada de la API de Finanzas Personales.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

import app.models  # noqa: F401  (registra los modelos en la metadata)
from app.api.auth import router as auth_router
from app.api.router import api_router
from app.core.config import settings
from app.core.constants import APP_NAME, APP_VERSION
from app.auth.dependencies import get_current_user
from app.core.exceptions import AppError
from app.database.base import Base
from app.database.database import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Tareas de arranque y apagado.
    """

    if settings.DB_CREATE_ALL:
        Base.metadata.create_all(bind=engine)

    yield

    engine.dispose()


app = FastAPI(
    title=f"{APP_NAME} API",
    version=APP_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    """
    Traduce las excepciones de dominio a respuestas HTTP.
    """

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.mensaje},
    )


# El router de autenticación queda fuera de la protección: es el
# único punto de entrada sin token.
app.include_router(auth_router, prefix=settings.API_PREFIX)

# Todo lo demás exige un token válido.
app.include_router(
    api_router,
    prefix=settings.API_PREFIX,
    dependencies=[Depends(get_current_user)],
)


# ----------------------------------------------------------------------
# Interfaz web
#
# La aplicación se sirve desde el propio backend. Al compartir origen
# con la API no hacen falta CORS ni configurar ninguna dirección: el
# navegador llama a rutas relativas.
# ----------------------------------------------------------------------

DIRECTORIO_WEB = Path(__file__).resolve().parent.parent / "static"

app.mount(
    "/static",
    StaticFiles(directory=DIRECTORIO_WEB),
    name="static",
)


@app.get("/", include_in_schema=False)
def web():
    """
    Sirve la aplicación web.
    """

    return FileResponse(DIRECTORIO_WEB / "index.html")


@app.get("/manifest.json", include_in_schema=False)
def manifest():
    """
    Datos de instalación de la aplicación.
    """

    return FileResponse(
        DIRECTORIO_WEB / "manifest.json",
        media_type="application/manifest+json",
    )


@app.get("/sw.js", include_in_schema=False)
def service_worker():
    """
    Service worker.

    Se sirve desde la raíz a propósito: un service worker solo puede
    controlar las rutas que cuelgan de su propia ubicación, así que
    desde /static/ no podría gestionar la aplicación entera.
    """

    return FileResponse(
        DIRECTORIO_WEB / "sw.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/info", tags=["Sistema"])
def info():
    """
    Información básica de la API.
    """

    return {
        "aplicacion": APP_NAME,
        "version": APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health", tags=["Sistema"])
def health():
    """
    Comprueba la conexión con la base de datos.
    """

    with engine.connect() as conn:

        conn.execute(text("SELECT 1"))

        return {
            "estado": "ok",
            "database": conn.execute(
                text("SELECT current_database()")
            ).scalar(),
            "schema": conn.execute(
                text("SELECT current_schema()")
            ).scalar(),
        }


@app.get("/debug", tags=["Sistema"])
def debug():
    """
    Conteo de registros por tabla. Solo disponible en modo DEBUG.
    """

    if not settings.DEBUG:
        return {"detail": "Disponible únicamente con DEBUG=True."}

    tablas = [
        "usuarios",
        "tiposmovimiento",
        "categorias",
        "subcategorias",
        "mediospago",
        "movimientos",
        "presupuestos",
        "pagos_recurrentes",
    ]

    with engine.connect() as conn:

        conteos = {
            tabla: conn.execute(
                text(f"SELECT COUNT(*) FROM {settings.DB_SCHEMA}.{tabla}")
            ).scalar()
            for tabla in tablas
        }

        return {
            "search_path": conn.execute(
                text("SHOW search_path")
            ).scalar(),
            "conteos": conteos,
            "tablas_en_metadata": sorted(Base.metadata.tables.keys()),
        }
