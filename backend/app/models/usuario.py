from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import TIMESTAMP
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database.base import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(
        Integer,
        primary_key=True
    )

    nombre = Column(
        String(100),
        nullable=False
    )

    email = Column(
        String(150),
        unique=True
    )

    password_hash = Column(
        String(255)
    )

    created_at = Column(
        TIMESTAMP,
        nullable=False,
        server_default=func.now()
    )

    updated_at = Column(
        TIMESTAMP,
        server_default=func.now(),
        onupdate=func.now()
    )

    deleted_at = Column(TIMESTAMP)

    movimientos = relationship(
        "Movimiento",
        back_populates="usuario"
    )
