from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Boolean
from sqlalchemy import ForeignKey
from sqlalchemy import TIMESTAMP
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.base import Base


class Categoria(Base):
    __tablename__ = "categorias"

    __table_args__ = (
        UniqueConstraint("nombre", "tipo_id", name="uq_categoria"),
    )

    id = Column(
        Integer,
        primary_key=True
    )

    nombre = Column(
        String(100),
        nullable=False
    )

    tipo_id = Column(
        Integer,
        ForeignKey("tiposmovimiento.id"),
        nullable=False
    )

    icono = Column(
        String(50)
    )

    # La base define color como VARCHAR(7): un código hexadecimal
    # del tipo #A1B2C3.
    color = Column(
        String(7)
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

    updated_at = Column(
        TIMESTAMP,
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relaciones

    tipo = relationship(
        "TipoMovimiento",
        back_populates="categorias"
    )

    subcategorias = relationship(
        "Subcategoria",
        back_populates="categoria"
    )
