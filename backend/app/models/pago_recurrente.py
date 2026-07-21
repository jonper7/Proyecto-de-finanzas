from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    TIMESTAMP,
)
from sqlalchemy import Index
from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text

from app.database.base import Base


class PagoRecurrente(Base):
    __tablename__ = "pagos_recurrentes"

    __table_args__ = (
        UniqueConstraint("uuid", name="uq_pagos_recurrentes_uuid"),
        Index("idx_pagos_recurrentes_updated", "updated_at"),
    )

    id = Column(Integer, primary_key=True)

    descripcion = Column(
        String(150),
        nullable=False
    )

    categoria_id = Column(
        Integer,
        ForeignKey("categorias.id")
    )

    subcategoria_id = Column(
        Integer,
        ForeignKey("subcategorias.id")
    )

    medio_pago_id = Column(
        Integer,
        ForeignKey("mediospago.id")
    )

    monto = Column(
        Numeric(10, 2),
        nullable=False
    )

    dia_pago = Column(
        Integer,
        nullable=False
    )

    activo = Column(
        Boolean,
        default=True,
        server_default="true"
    )

    created_at = Column(
        TIMESTAMP,
        server_default=func.now()
    )

    # Vigencia del pago recurrente.
    fecha_inicio = Column(Date)

    fecha_fin = Column(Date)

    # Última fecha en la que se generó el movimiento asociado.
    ultima_generacion = Column(Date)

    # Sincronización

    uuid = Column(
        UUID(as_uuid=True),
        nullable=False,
        server_default=text("gen_random_uuid()")
    )

    updated_at = Column(
        TIMESTAMP,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    deleted_at = Column(TIMESTAMP)

    sync_at = Column(TIMESTAMP)

    device_updated_at = Column(TIMESTAMP)

    sync_status = Column(
        String(20),
        nullable=False,
        server_default=text("'pending'")
    )

    # Relaciones

    categoria = relationship("Categoria")

    subcategoria = relationship("Subcategoria")

    medio_pago = relationship("MedioPago")
