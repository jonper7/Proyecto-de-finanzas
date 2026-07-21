from sqlalchemy import Column
from sqlalchemy import ForeignKey
from sqlalchemy import Index
from sqlalchemy import Integer
from sqlalchemy import Numeric
from sqlalchemy import SmallInteger
from sqlalchemy import String
from sqlalchemy import TIMESTAMP
from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text

from app.database.base import Base


class Presupuesto(Base):
    __tablename__ = "presupuestos"

    # La base tiene dos restricciones únicas equivalentes sobre las
    # mismas columnas: una con nombre explícito y otra generada por
    # PostgreSQL. Se declaran ambas para no provocar diferencias.
    __table_args__ = (
        UniqueConstraint(
            "usuario_id", "categoria_id", "mes", "anio",
            name="uq_presupuesto_mes",
        ),
        UniqueConstraint(
            "usuario_id", "categoria_id", "mes", "anio",
            name="presupuestos_usuario_id_categoria_id_mes_anio_key",
        ),
        Index("idx_presup_usuario_mes", "usuario_id", "mes", "anio"),
        UniqueConstraint("uuid", name="uq_presupuestos_uuid"),
        Index("idx_presupuestos_updated", "updated_at"),
    )

    id = Column(
        Integer,
        primary_key=True
    )

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    categoria_id = Column(
        Integer,
        ForeignKey("categorias.id"),
        nullable=False
    )

    mes = Column(
        SmallInteger,
        nullable=False
    )

    anio = Column(
        SmallInteger,
        nullable=False
    )

    monto_limite = Column(
        Numeric(12, 2),
        nullable=False
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

    # Sincronización

    uuid = Column(
        UUID(as_uuid=True),
        nullable=False,
        server_default=text("gen_random_uuid()")
    )

    sync_at = Column(TIMESTAMP)

    device_updated_at = Column(TIMESTAMP)

    sync_status = Column(
        String(20),
        nullable=False,
        server_default=text("'pending'")
    )

    # Relaciones

    usuario = relationship("Usuario")

    categoria = relationship("Categoria")
