"""
Configura la carpeta de Google Drive donde llegan las copias.

Uso (desde la carpeta backend/, con el entorno virtual activo):

    python -m scripts.configurar_drive
    python -m scripts.configurar_drive "G:\\Mi unidad\\Finanzas"

Sin argumentos busca la instalación de Google Drive para escritorio,
crea dentro una carpeta «Finanzas» y guarda la ruta en el .env como
DRIVE_CARPETA. A partir de ahí basta con:

    python -m scripts.importar_carpeta . tu@email.com
"""

import sys
from pathlib import Path

# Nombres que usa Google Drive para escritorio según el idioma.
NOMBRES_UNIDAD = ("Mi unidad", "My Drive", "Meu Drive", "Mon Drive")

CARPETA_COPIAS = "Finanzas"

CLAVE_ENV = "DRIVE_CARPETA"


def posibles_ubicaciones() -> list[Path]:
    """
    Sitios donde Google Drive para escritorio suele montarse.

    En Windows se monta como una unidad con letra, que cambia de un
    equipo a otro, así que se recorren todas.
    """

    candidatas: list[Path] = []

    # Unidades de Windows. Se empieza por G, que es la habitual.
    letras = ["G", "H", "I", "J", "K"] + [
        chr(c) for c in range(ord("D"), ord("Z") + 1)
    ]

    for letra in dict.fromkeys(letras):
        for nombre in NOMBRES_UNIDAD:
            candidatas.append(Path(f"{letra}:/{nombre}"))

    # Instalaciones antiguas y otros sistemas.
    casa = Path.home()

    candidatas.append(casa / "Google Drive")
    candidatas.append(casa / "GoogleDrive")

    for nombre in NOMBRES_UNIDAD:
        candidatas.append(casa / nombre)
        candidatas.append(casa / "Google Drive" / nombre)

    return candidatas


def buscar_drive() -> Path | None:
    """
    Primera ubicación de Drive que exista de verdad.
    """

    for ruta in posibles_ubicaciones():
        try:
            if ruta.is_dir():
                return ruta
        except OSError:
            # Una unidad desconectada puede dar error al consultarla.
            continue

    return None


def comprobar_escritura(carpeta: Path) -> bool:
    """
    Comprueba que se puede escribir, creando y borrando un archivo.
    """

    prueba = carpeta / ".finanzas_prueba"

    try:
        prueba.write_text("ok", encoding="utf-8")
        prueba.unlink()
        return True
    except OSError:
        return False


def guardar_en_env(carpeta: Path) -> Path:
    """
    Escribe o actualiza DRIVE_CARPETA en el archivo .env.
    """

    env = Path(".env")

    if not env.exists():
        sys.exit(
            "No encuentro el archivo .env.\n"
            "Ejecuta el script desde la carpeta backend/."
        )

    lineas = env.read_text(encoding="utf-8").splitlines()

    valor = f'{CLAVE_ENV}={carpeta}'

    for indice, linea in enumerate(lineas):
        if linea.strip().startswith(f"{CLAVE_ENV}="):
            lineas[indice] = valor
            break
    else:
        if lineas and lineas[-1].strip():
            lineas.append("")
        lineas.append("# Carpeta de Google Drive con las copias del móvil")
        lineas.append(valor)

    env.write_text("\n".join(lineas) + "\n", encoding="utf-8")

    return env


def main() -> None:

    argumentos = sys.argv[1:]

    if argumentos and argumentos[0] in ("-h", "--help"):
        sys.exit(__doc__)

    print()

    # --- 1. Localizar la carpeta -------------------------------------

    if argumentos:

        carpeta = Path(argumentos[0]).expanduser()

        if not carpeta.exists():
            respuesta = input(
                f"  {carpeta} no existe. ¿La creo? [s/N]: "
            ).strip().lower()

            if respuesta != "s":
                sys.exit("  Cancelado.")

            try:
                carpeta.mkdir(parents=True, exist_ok=True)
            except OSError as error:
                sys.exit(f"  No se pudo crear: {error}")

    else:

        print("  Buscando Google Drive...")

        unidad = buscar_drive()

        if unidad is None:
            sys.exit(
                "\n  No encuentro Google Drive para escritorio.\n\n"
                "  Instálalo desde https://www.google.com/drive/download/\n"
                "  e inicia sesión. Después vuelve a ejecutar esto.\n\n"
                "  Si ya lo tienes, pásame la ruta a mano:\n"
                '      python -m scripts.configurar_drive "G:\\Mi unidad"\n'
            )

        print(f"  Encontrado: {unidad}")

        carpeta = unidad / CARPETA_COPIAS

        if not carpeta.exists():
            carpeta.mkdir(parents=True, exist_ok=True)
            print(f"  Carpeta creada: {carpeta}")
        else:
            print(f"  Carpeta ya existente: {carpeta}")

    # --- 2. Comprobar que se puede escribir --------------------------

    if not comprobar_escritura(carpeta):
        sys.exit(
            f"\n  No se puede escribir en {carpeta}.\n"
            "  Comprueba que Google Drive está sincronizando.\n"
        )

    # --- 3. Guardar en el .env ---------------------------------------

    env = guardar_en_env(carpeta)

    copias = list(carpeta.glob("*.json"))

    print(f"  Guardado en {env.resolve()}")
    print(f"  Copias encontradas ahora mismo: {len(copias)}")

    print(f"""
  Listo.

  En el móvil:
    Ajustes -> Descargar copia -> compartir a Drive
    y guardarlo en la carpeta «{CARPETA_COPIAS}».

  En el ordenador, cuando quieras actualizar la base de datos:
    python -m scripts.importar_carpeta . tu@email.com --simular
    python -m scripts.importar_carpeta . tu@email.com
""")


if __name__ == "__main__":
    main()
