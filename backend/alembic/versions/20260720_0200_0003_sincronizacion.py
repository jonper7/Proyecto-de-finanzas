"""Columnas de sincronización.

Prepara presupuestos y pagos recurrentes para sincronizarse en ambos
sentidos con la aplicación móvil, y añade a los catálogos la marca de
modificación que necesita la descarga incremental.

Los uuid de las filas existentes se rellenan con gen_random_uuid()
antes de marcar la columna como obligatoria.

Revision ID: 0003_sincronizacion
Revises: 0002_password_hash
Create Date: 2026-07-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_sincronizacion"
down_revision: Union[str, None] = "0002_password_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ESQUEMA = "transacciones"

# Tablas que se sincronizan en ambos sentidos.
SINCRONIZABLES = ("presupuestos", "pagos_recurrentes")

# Catálogos que el móvil solo descarga.
CATALOGOS = ("subcategorias", "mediospago", "tiposmovimiento")


def upgrade() -> None:

    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    for tabla in SINCRONIZABLES:

        # El uuid se crea nullable, se rellena y luego se hace
        # obligatorio: así las filas que ya existen no bloquean la
        # migración.
        op.add_column(
            tabla,
            sa.Column("uuid", postgresql.UUID(as_uuid=True), nullable=True),
            schema=ESQUEMA,
        )

        op.execute(
            f"UPDATE {ESQUEMA}.{tabla} "
            "SET uuid = gen_random_uuid() WHERE uuid IS NULL"
        )

        op.alter_column(tabla, "uuid", nullable=False, schema=ESQUEMA)

        op.create_unique_constraint(
            f"uq_{tabla}_uuid", tabla, ["uuid"], schema=ESQUEMA
        )

        op.add_column(
            tabla,
            sa.Column("sync_at", sa.TIMESTAMP(), nullable=True),
            schema=ESQUEMA,
        )

        op.add_column(
            tabla,
            sa.Column("device_updated_at", sa.TIMESTAMP(), nullable=True),
            schema=ESQUEMA,
        )

        op.add_column(
            tabla,
            sa.Column(
                "sync_status",
                sa.String(length=20),
                nullable=False,
                server_default=sa.text("'pending'"),
            ),
            schema=ESQUEMA,
        )

    # pagos_recurrentes no tenía control de modificación ni borrado
    # lógico; presupuestos ya los traía.
    op.add_column(
        "pagos_recurrentes",
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema=ESQUEMA,
    )

    op.add_column(
        "pagos_recurrentes",
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
        schema=ESQUEMA,
    )

    for tabla in CATALOGOS:

        op.add_column(
            tabla,
            sa.Column(
                "updated_at",
                sa.TIMESTAMP(),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            schema=ESQUEMA,
        )

    # Índices para que la descarga incremental no recorra la tabla
    # entera en cada sincronización.
    op.create_index(
        "idx_presupuestos_updated",
        "presupuestos",
        ["updated_at"],
        schema=ESQUEMA,
    )

    op.create_index(
        "idx_pagos_recurrentes_updated",
        "pagos_recurrentes",
        ["updated_at"],
        schema=ESQUEMA,
    )

    op.create_index(
        "idx_movimientos_updated",
        "movimientos",
        ["updated_at"],
        schema=ESQUEMA,
    )


def downgrade() -> None:

    op.drop_index("idx_movimientos_updated", table_name="movimientos", schema=ESQUEMA)
    op.drop_index("idx_pagos_recurrentes_updated", table_name="pagos_recurrentes", schema=ESQUEMA)
    op.drop_index("idx_presupuestos_updated", table_name="presupuestos", schema=ESQUEMA)

    for tabla in CATALOGOS:
        op.drop_column(tabla, "updated_at", schema=ESQUEMA)

    op.drop_column("pagos_recurrentes", "deleted_at", schema=ESQUEMA)
    op.drop_column("pagos_recurrentes", "updated_at", schema=ESQUEMA)

    for tabla in SINCRONIZABLES:
        op.drop_column(tabla, "sync_status", schema=ESQUEMA)
        op.drop_column(tabla, "device_updated_at", schema=ESQUEMA)
        op.drop_column(tabla, "sync_at", schema=ESQUEMA)
        op.drop_constraint(f"uq_{tabla}_uuid", tabla, schema=ESQUEMA, type_="unique")
        op.drop_column(tabla, "uuid", schema=ESQUEMA)
