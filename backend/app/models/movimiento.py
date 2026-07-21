from sqlalchemy import (
    Column,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    TIMESTAMP,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text

from app.database.base import Base


class Movimiento(Base):
    __tablename__ = "movimientos"

    # Los índices reproducen los que ya existen en la base. Hay
    # duplicados heredados (idx_mov_fecha e idx_movimientos_fecha
    # indexan lo mismo); se declaran igualmente para que el
    # autogenerado de Alembic no proponga borrarlos.
    __table_args__ = (
        UniqueConstraint("uuid", name="uq_movimientos_uuid"),
        Index("idx_mov_fecha", text("fecha DESC")),
        Index("idx_mov_tipo", "tipo"),
        Index("idx_mov_usuario", "usuario_id"),
        Index("idx_movimientos_deleted", "deleted_at"),
        Index("idx_movimientos_fecha", "fecha"),
        Index("idx_movimientos_sync", "sync_at"),
        Index("idx_movimientos_usuario", "usuario_id"),
        Index("idx_movimientos_uuid", "uuid"),
        Index("idx_movimientos_updated", "updated_at"),
    )

    id = Column(Integer, primary_key=True)

    fecha = Column(Date, nullable=False)

    descripcion = Column(String(255))

    monto = Column(Numeric(12, 2), nullable=False)

    # VARCHAR(10) con un CHECK que solo admite 'ingreso' y 'gasto'.
    tipo = Column(String(10), nullable=False)

    subcategoria_id = Column(
        Integer,
        ForeignKey("subcategorias.id"),
        nullable=False
    )

    medio_pago_id = Column(
        Integer,
        ForeignKey("mediospago.id")
    )

    comentario = Column(Text)

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id")
    )

    uuid = Column(
        UUID(as_uuid=True),
        nullable=False,
        server_default=text("gen_random_uuid()")
    )

    created_at = Column(
        TIMESTAMP,
        nullable=False,
        server_default=func.now()
    )

    updated_at = Column(
        TIMESTAMP,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    sync_at = Column(TIMESTAMP)

    deleted_at = Column(TIMESTAMP)

    sync_status = Column(
        String(20),
        nullable=False,
        server_default=text("'pending'")
    )

    device_updated_at = Column(TIMESTAMP)

    # Distingue el cliente que creó el registro (desktop, movil...).
    origen = Column(
        String(20),
        server_default=text("'desktop'")
    )

    # Relaciones

    subcategoria = relationship(
        "Subcategoria",
        back_populates="movimientos"
    )

    medio_pago = relationship(
        "MedioPago",
        back_populates="movimientos"
    )

    usuario = relationship(
        "Usuario",
        back_populates="movimientos"
    )
