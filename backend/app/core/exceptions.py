"""
Excepciones de dominio de la aplicación.

Las capas de servicio y repositorio lanzan estas excepciones.
La capa API las traduce a respuestas HTTP mediante los manejadores
registrados en ``app.main``.
"""


class AppError(Exception):
    """
    Error base de la aplicación.
    """

    status_code: int = 400
    mensaje: str = "Error en la solicitud."

    def __init__(self, mensaje: str | None = None):

        if mensaje is not None:
            self.mensaje = mensaje

        super().__init__(self.mensaje)


class NotFoundError(AppError):
    """
    El recurso solicitado no existe.
    """

    status_code = 404
    mensaje = "Recurso no encontrado."


class ConflictError(AppError):
    """
    La operación entra en conflicto con el estado actual de los datos.
    """

    status_code = 409
    mensaje = "Conflicto con el estado actual del recurso."


class ValidationError(AppError):
    """
    Los datos recibidos no cumplen una regla de negocio.
    """

    status_code = 422
    mensaje = "Los datos enviados no son válidos."
