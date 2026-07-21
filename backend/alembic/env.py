"""
Entorno de migraciones de Alembic.

La URL de conexión y el esquema se toman de ``app.core.config.settings``,
de modo que Alembic y la aplicación siempre apuntan al mismo sitio.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool, text

# Permite importar el paquete ``app`` desde este archivo.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.database.base import Base  # noqa: E402

import app.models  # noqa: F401,E402  (registra los modelos en la metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata objetivo para el autogenerado.
target_metadata = Base.metadata

# Esquema donde vive la aplicación.
ESQUEMA = settings.DB_SCHEMA


def obtener_url() -> str:
    """
    URL de conexión. Puede sobrescribirse con ALEMBIC_DATABASE_URL.
    """

    url = os.getenv("ALEMBIC_DATABASE_URL") or settings.database_url

    # ConfigParser interpreta '%' como interpolación.
    return url.replace("%", "%%")


def include_object(objeto, nombre, tipo, reflejado, comparado_con):
    """
    Restringe el autogenerado al esquema de la aplicación.

    Las tablas de la metadata siempre llevan schema='transacciones'.
    Las que se reflejan desde 'public' llegan con schema=None, así que
    quedan fuera: son ajenas a la aplicación y Alembic no debe
    proponer borrarlas.
    """

    if tipo == "table":
        return objeto.schema == ESQUEMA

    return True


def run_migrations_offline() -> None:
    """
    Ejecuta las migraciones generando SQL, sin conectar a la base.
    """

    context.configure(
        url=obtener_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_object=include_object,
        version_table_schema=ESQUEMA,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Ejecuta las migraciones conectando a la base de datos.
    """

    config.set_main_option("sqlalchemy.url", obtener_url())

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:

        # Garantiza que el esquema exista antes de crear alembic_version.
        #
        # Importante: NO se toca el search_path. Si se hiciera, la
        # reflexión vería las tablas de 'transacciones' como si
        # estuvieran en el esquema por defecto y el autogenerado
        # propondría borrarlas y volver a crearlas.
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{ESQUEMA}"'))
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_object=include_object,
            version_table_schema=ESQUEMA,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
