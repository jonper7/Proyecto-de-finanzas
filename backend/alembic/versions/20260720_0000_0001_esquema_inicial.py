"""Esquema inicial de la aplicación.

Crea el esquema ``transacciones`` y las ocho tablas del dominio,
reproduciendo la base de datos existente: restricciones únicas con
sus nombres originales, índices heredados y los CHECK de tipo y
periodo.

Esta migración describe el estado actual de la base. Si tu base YA
tiene estas tablas, no la ejecutes: márcala como aplicada con
``alembic stamp head``.

Revision ID: 0001_esquema_inicial
Revises:
Create Date: 2026-07-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_esquema_inicial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ESQUEMA = "transacciones"


def upgrade() -> None:

    op.execute(f'CREATE SCHEMA IF NOT EXISTS "{ESQUEMA}"')

    # gen_random_uuid() es nativo desde PostgreSQL 13.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table('mediospago',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=50), nullable=False),
    sa.Column('activo', sa.Boolean(), server_default='true', nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nombre', name='uq_medio_pago_nombre'),
    schema='transacciones'
    )
    op.create_table('tiposmovimiento',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=20), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nombre', name='uq_tipo_nombre'),
    schema='transacciones'
    )
    op.create_table('usuarios',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=100), nullable=False),
    sa.Column('email', sa.String(length=150), nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email'),
    schema='transacciones'
    )
    op.create_table('categorias',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=100), nullable=False),
    sa.Column('tipo_id', sa.Integer(), nullable=False),
    sa.Column('icono', sa.String(length=50), nullable=True),
    sa.Column('color', sa.String(length=7), nullable=True),
    sa.Column('activo', sa.Boolean(), server_default='true', nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['tipo_id'], ['transacciones.tiposmovimiento.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nombre', 'tipo_id', name='uq_categoria'),
    schema='transacciones'
    )
    op.create_table('presupuestos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('categoria_id', sa.Integer(), nullable=False),
    sa.Column('mes', sa.SmallInteger(), nullable=False),
    sa.Column('anio', sa.SmallInteger(), nullable=False),
    sa.Column('monto_limite', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(), nullable=True),
    sa.ForeignKeyConstraint(['categoria_id'], ['transacciones.categorias.id'], ),
    sa.ForeignKeyConstraint(['usuario_id'], ['transacciones.usuarios.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('usuario_id', 'categoria_id', 'mes', 'anio', name='presupuestos_usuario_id_categoria_id_mes_anio_key'),
    sa.UniqueConstraint('usuario_id', 'categoria_id', 'mes', 'anio', name='uq_presupuesto_mes'),
    schema='transacciones'
    )
    op.create_index('idx_presup_usuario_mes', 'presupuestos', ['usuario_id', 'mes', 'anio'], unique=False, schema='transacciones')
    op.create_table('subcategorias',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=100), nullable=False),
    sa.Column('categoria_id', sa.Integer(), nullable=False),
    sa.Column('activo', sa.Boolean(), server_default='true', nullable=True),
    sa.ForeignKeyConstraint(['categoria_id'], ['transacciones.categorias.id'], ),
    sa.PrimaryKeyConstraint('id'),
    schema='transacciones'
    )
    op.create_table('movimientos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('descripcion', sa.String(length=255), nullable=True),
    sa.Column('monto', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('tipo', sa.String(length=10), nullable=False),
    sa.Column('subcategoria_id', sa.Integer(), nullable=False),
    sa.Column('medio_pago_id', sa.Integer(), nullable=True),
    sa.Column('comentario', sa.Text(), nullable=True),
    sa.Column('usuario_id', sa.Integer(), nullable=True),
    sa.Column('uuid', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=False),
    sa.Column('sync_at', sa.TIMESTAMP(), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(), nullable=True),
    sa.Column('sync_status', sa.String(length=20), server_default=sa.text("'pending'"), nullable=False),
    sa.Column('device_updated_at', sa.TIMESTAMP(), nullable=True),
    sa.Column('origen', sa.String(length=20), server_default=sa.text("'desktop'"), nullable=True),
    sa.ForeignKeyConstraint(['medio_pago_id'], ['transacciones.mediospago.id'], ),
    sa.ForeignKeyConstraint(['subcategoria_id'], ['transacciones.subcategorias.id'], ),
    sa.ForeignKeyConstraint(['usuario_id'], ['transacciones.usuarios.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('uuid', name='uq_movimientos_uuid'),
    schema='transacciones'
    )
    # Índice por expresión: la fecha en orden descendente.
    op.create_index('idx_mov_fecha', 'movimientos', [sa.text('fecha DESC')], unique=False, schema='transacciones')
    op.create_index('idx_mov_tipo', 'movimientos', ['tipo'], unique=False, schema='transacciones')
    op.create_index('idx_mov_usuario', 'movimientos', ['usuario_id'], unique=False, schema='transacciones')
    op.create_index('idx_movimientos_deleted', 'movimientos', ['deleted_at'], unique=False, schema='transacciones')
    op.create_index('idx_movimientos_fecha', 'movimientos', ['fecha'], unique=False, schema='transacciones')
    op.create_index('idx_movimientos_sync', 'movimientos', ['sync_at'], unique=False, schema='transacciones')
    op.create_index('idx_movimientos_usuario', 'movimientos', ['usuario_id'], unique=False, schema='transacciones')
    op.create_index('idx_movimientos_uuid', 'movimientos', ['uuid'], unique=False, schema='transacciones')
    op.create_table('pagos_recurrentes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('descripcion', sa.String(length=150), nullable=False),
    sa.Column('categoria_id', sa.Integer(), nullable=True),
    sa.Column('subcategoria_id', sa.Integer(), nullable=True),
    sa.Column('medio_pago_id', sa.Integer(), nullable=True),
    sa.Column('monto', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('dia_pago', sa.Integer(), nullable=False),
    sa.Column('activo', sa.Boolean(), server_default='true', nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()'), nullable=True),
    sa.Column('fecha_inicio', sa.Date(), nullable=True),
    sa.Column('fecha_fin', sa.Date(), nullable=True),
    sa.Column('ultima_generacion', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['categoria_id'], ['transacciones.categorias.id'], ),
    sa.ForeignKeyConstraint(['medio_pago_id'], ['transacciones.mediospago.id'], ),
    sa.ForeignKeyConstraint(['subcategoria_id'], ['transacciones.subcategorias.id'], ),
    sa.PrimaryKeyConstraint('id'),
    schema='transacciones'
    )

    # Restricciones CHECK que SQLAlchemy no declara en los modelos.
    op.create_check_constraint(
        "movimientos_tipo_check",
        "movimientos",
        "tipo IN ('ingreso', 'gasto')",
        schema=ESQUEMA,
    )
    op.create_check_constraint(
        "presupuestos_mes_check",
        "presupuestos",
        "mes >= 1 AND mes <= 12",
        schema=ESQUEMA,
    )
    op.create_check_constraint(
        "presupuestos_anio_check",
        "presupuestos",
        "anio >= 2000 AND anio <= 2100",
        schema=ESQUEMA,
    )
    op.create_check_constraint(
        "presupuestos_monto_limite_check",
        "presupuestos",
        "monto_limite > 0",
        schema=ESQUEMA,
    )


def downgrade() -> None:

    op.drop_table('pagos_recurrentes', schema='transacciones')
    op.drop_index('idx_movimientos_uuid', table_name='movimientos', schema='transacciones')
    op.drop_index('idx_movimientos_usuario', table_name='movimientos', schema='transacciones')
    op.drop_index('idx_movimientos_sync', table_name='movimientos', schema='transacciones')
    op.drop_index('idx_movimientos_fecha', table_name='movimientos', schema='transacciones')
    op.drop_index('idx_movimientos_deleted', table_name='movimientos', schema='transacciones')
    op.drop_index('idx_mov_usuario', table_name='movimientos', schema='transacciones')
    op.drop_index('idx_mov_tipo', table_name='movimientos', schema='transacciones')
    op.drop_index('idx_mov_fecha', table_name='movimientos', schema='transacciones')
    op.drop_table('movimientos', schema='transacciones')
    op.drop_table('subcategorias', schema='transacciones')
    op.drop_index('idx_presup_usuario_mes', table_name='presupuestos', schema='transacciones')
    op.drop_table('presupuestos', schema='transacciones')
    op.drop_table('categorias', schema='transacciones')
    op.drop_table('usuarios', schema='transacciones')
    op.drop_table('tiposmovimiento', schema='transacciones')
    op.drop_table('mediospago', schema='transacciones')
