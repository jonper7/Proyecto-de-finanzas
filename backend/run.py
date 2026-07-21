"""
Arranque de la API en desarrollo:

    python run.py
"""

import socket

import uvicorn

from app.core.config import settings


def ip_local() -> str | None:
    """
    Dirección de este equipo en la red local.

    No se envía nada: se abre un socket UDP hacia una dirección
    externa solo para que el sistema revele por qué interfaz saldría.
    """

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(0.2)
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def mostrar_direcciones() -> None:
    """
    Imprime las URLs que sí se pueden abrir en un navegador.

    Uvicorn anuncia 0.0.0.0, que significa «escucha en todas las
    interfaces» y no es una dirección navegable.
    """

    puerto = settings.API_PORT
    ip = ip_local()

    print()
    print(f"  Aplicación   http://localhost:{puerto}")
    print(f"  Documentación  http://localhost:{puerto}/docs")

    if ip:
        print(f"  Desde el móvil  http://{ip}:{puerto}")
        print()
        print("  Si el móvil no conecta, permite el puerto en el")
        print("  firewall de Windows para redes privadas.")

    print()


if __name__ == "__main__":

    mostrar_direcciones()

    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True,
    )
