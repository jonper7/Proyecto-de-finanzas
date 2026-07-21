from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

metadata = MetaData(schema=settings.DB_SCHEMA)


class Base(DeclarativeBase):
    metadata = metadata
