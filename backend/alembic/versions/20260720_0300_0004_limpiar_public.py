"""Elimina las tablas sobrantes del esquema public.

Son restos de las primeras ejecuciones de ``create_all()``, cuando
SQLAlchemy todavía escribía en ``public`` en lugar de en
``transacciones``. Están vacías y duplican el modelo antiguo.

La migración es defensiva: cada tabla solo se borra si NO tiene
filas. Si alguna contiene datos, se deja intacta y se avisa por
consola, para que puedas revisarla a mano.

Esta revisión es opcional: si prefieres conservar esas tablas,
puedes saltártela con ``alembic stamp 0004_limpiar_public``.

Revision ID: 0004_limpiar_public
Revises: 0003_sincronizacion
Create Date: 2026-07-20
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004_limpiar_public"
down_revision: Union[str, None] = "0003_sincronizacion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# El orden importa: primero las que dependen de otras.
TABLAS_SOBRANTES = (
    "movimientos",
    "subcategorias",
    "categorias",
    "tiposmovimiento",
    "mediospago",
    "usuarios",
)


def upgrade() -> None:

    for tabla in TABLAS_SOBRANTES:

        op.execute(
            f"""
            DO $$
            DECLARE
                filas bigint;
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = '{tabla}'
                ) THEN

                    EXECUTE 'SELECT count(*) FROM public.{tabla}'
                    INTO filas;

                    IF filas = 0 THEN
                        EXECUTE 'DROP TABLE public.{tabla} CASCADE';
                        RAISE NOTICE 'public.{tabla} eliminada.';
                    ELSE
                        RAISE WARNING
                            'public.{tabla} conservada: contiene % filas.',
                            filas;
                    END IF;

                END IF;
            END $$;
            """
        )


def downgrade() -> None:

    # No se recrean: eran tablas vacías y duplicadas. Si hicieran
    # falta, la revisión 0001 describe su estructura.
    pass
