from sqlalchemy import Column
from sqlalchemy import TIMESTAMP
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Boolean
from sqlalchemy import ForeignKey

from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.base import Base


class Subcategoria(Base):
    __tablename__ = "subcategorias"

    id = Column(
        Integer,
        primary_key=True
    )

    nombre = Column(
        String(100),
        nullable=False
    )

    categoria_id = Column(
        Integer,
        ForeignKey("categorias.id"),
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

    # Relaciones

    categoria = relationship(
        "Categoria",
        back_populates="subcategorias"
    )

    movimientos = relationship(
        "Movimiento",
        back_populates="subcategoria"
    )
