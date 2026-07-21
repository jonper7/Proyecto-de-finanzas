"""Añade la columna password_hash a usuarios.

La columna es nullable: los usuarios que ya existen se quedan sin
contraseña hasta que se les asigne una con:

    python -m scripts.gestionar_usuario password <email>

Un usuario sin password_hash no puede iniciar sesión.

Revision ID: 0002_password_hash
Revises: 0001_esquema_inicial
Create Date: 2026-07-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_password_hash"
down_revision: Union[str, None] = "0001_esquema_inicial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ESQUEMA = "transacciones"


def upgrade() -> None:

    op.add_column(
        "usuarios",
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        schema=ESQUEMA,
    )


def downgrade() -> None:

    op.drop_column(
        "usuarios",
        "password_hash",
        schema=ESQUEMA,
    )
