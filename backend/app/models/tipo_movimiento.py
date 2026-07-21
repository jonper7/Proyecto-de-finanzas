from sqlalchemy import Column
from sqlalchemy import TIMESTAMP
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.base import Base


class TipoMovimiento(Base):
    __tablename__ = "tiposmovimiento"

    __table_args__ = (
        UniqueConstraint("nombre", name="uq_tipo_nombre"),
    )

    id = Column(
        Integer,
        primary_key=True
    )

    nombre = Column(
        String(20),
        nullable=False
    )

    # Marca de modificación, usada por la sincronización.

    updated_at = Column(
        TIMESTAMP,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relaciones

    categorias = relationship(
        "Categoria",
        back_populates="tipo"
    )
