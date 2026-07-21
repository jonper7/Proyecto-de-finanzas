"""
Importa en PostgreSQL todas las copias que haya en una carpeta.

Pensado para usarse con Google Drive para escritorio: el móvil sube
el JSON a Drive y el ordenador lo ve como un archivo local. No hace
falta la API de Google ni credenciales.

Uso (desde la carpeta backend/, con el entorno virtual activo):

    python -m scripts.importar_carpeta <carpeta> <email>
    python -m scripts.importar_carpeta <carpeta> <email> --simular
    python -m scripts.importar_carpeta <carpeta> <email> --todos

Por defecto solo procesa el archivo más reciente, que es lo que
normalmente hace falta: cada copia contiene el historial completo.
Con ``--todos`` se recorren todas las copias de la carpeta, de la más
antigua a la más nueva, útil la primera vez.

Si defines DRIVE_CARPETA en el archivo .env puedes omitir la carpeta:

    python -m scripts.importar_carpeta . <email>
"""

import os
import sys
from pathlib import Path

from scripts.importar_copia import importar


def copias_en(carpeta: Path) -> list[Path]:
    """
    Archivos de copia de la carpeta, del más antiguo al más reciente.
    """

    archivos = [
        ruta
        for ruta in carpeta.glob("*.json")
        if not ruta.name.startswith(".")
    ]

    return sorted(archivos, key=lambda ruta: ruta.stat().st_mtime)


def main() -> None:

    argumentos = [a for a in sys.argv[1:] if not a.startswith("--")]

    simular = "--simular" in sys.argv
    todos = "--todos" in sys.argv

    if len(argumentos) != 2:
        sys.exit(__doc__)

    carpeta_texto, email = argumentos

    # Un punto significa «usa la carpeta del .env».
    if carpeta_texto == ".":
        carpeta_texto = os.getenv("DRIVE_CARPETA", "")

        if not carpeta_texto:
            sys.exit(
                "No hay carpeta indicada.\n"
                "Pásala como argumento o define DRIVE_CARPETA en el .env"
            )

    carpeta = Path(carpeta_texto).expanduser()

    if not carpeta.is_dir():
        sys.exit(f"No existe la carpeta {carpeta}.")

    archivos = copias_en(carpeta)

    if not archivos:
        sys.exit(f"No hay archivos .json en {carpeta}.")

    if not todos:
        archivos = archivos[-1:]

    print(f"\n  Carpeta: {carpeta}")
    print(f"  Archivos a procesar: {len(archivos)}")

    for ruta in archivos:
        importar(ruta, email, simular)

    if not simular:
        print("  Listo. Puedes ver los datos en http://localhost:8000\n")


if __name__ == "__main__":
    main()
