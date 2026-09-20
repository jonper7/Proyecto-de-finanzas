from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuración de la aplicación leída desde variables de entorno
    o desde el archivo ``.env``.
    """

    # Base de datos
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_SCHEMA: str = "transacciones"

    # Crea las tablas al arrancar. Dejar en False cuando se use Alembic.
    DB_CREATE_ALL: bool = False

    # Muestra el SQL generado por SQLAlchemy.
    DB_ECHO: bool = False

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_PREFIX: str = ""
    DEBUG: bool = False

    # CORS (separar por comas)
    CORS_ORIGINS: str = "*"

    # Seguridad
    # SECRET_KEY no tiene valor por defecto a propósito: la aplicación
    # debe negarse a arrancar si no está definida.
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"

    # 7 días. La app móvil no tiene refresh token todavía, así que el
    # token de acceso dura lo suficiente para no molestar al usuario.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Carpeta sincronizada (Drive, OneDrive...) con las copias del
    # móvil. La usa scripts.importar_carpeta cuando se le pasa un punto.
    DRIVE_CARPETA: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origen.strip()
            for origen in self.CORS_ORIGINS.split(",")
            if origen.strip()
        ]


settings = Settings()
