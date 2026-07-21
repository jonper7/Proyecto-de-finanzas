from sqlalchemy import Column
from sqlalchemy import TIMESTAMP
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Boolean
from sqlalchemy import UniqueConstraint

from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.base import Base


class MedioPago(Base):
    __tablename__ = "mediospago"

    __table_args__ = (
        UniqueConstraint("nombre", name="uq_medio_pago_nombre"),
    )

    id = Column(
        Integer,
        primary_key=True
    )

    nombre = Column(
        String(50),
        nullable=False
    )

    activo = Column(
        Boolean,
        default=True,
        server_default="true"
    )

    # Marca de modificación, usada por la sincronización.

    updated_at = Column(
        TIMESTAMP,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relación

    movimientos = relationship(
        "Movimiento",
        back_populates="medio_pago"
    )
