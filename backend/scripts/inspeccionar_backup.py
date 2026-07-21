"""
Mira qué hay dentro de un backup de PostgreSQL sin restaurarlo.

Uso:

    python -m scripts.inspeccionar_backup <archivo>
    python -m scripts.inspeccionar_backup <archivo> --tabla movimientos

Sirve para saber en segundos si un backup contiene datos de verdad,
en lugar de montar un servidor entero para descubrir que está vacío.

Solo entiende volcados en texto plano (los que genera pg_dump sin
``-Fc``). Si el archivo empieza por «PGDMP» es de formato comprimido
y hay que convertirlo antes:

    pg_restore -f salida.sql archivo.backup
"""

import re
import sys
from pathlib import Path

# Esquemas internos de Supabase y PostgreSQL: rara vez interesan.
ESQUEMAS_DE_SISTEMA = {
    "auth", "storage", "realtime", "vault", "graphql", "graphql_public",
    "extensions", "pgbouncer", "supabase_functions", "supabase_migrations",
    "information_schema", "pg_catalog", "cron", "net", "_analytics",
    "_realtime", "pgsodium", "pgsodium_masks",
}


def esquema_de(tabla: str) -> str:
    return tabla.split(".")[0] if "." in tabla else "public"


def analizar(ruta: Path) -> dict:
    """
    Recorre el volcado y cuenta las filas de cada bloque COPY.
    """

    cabecera = ruta.read_bytes()[:5]

    if cabecera.startswith(b"PGDMP"):
        sys.exit(
            "Este archivo está en formato comprimido de PostgreSQL.\n"
            "Conviértelo primero:\n"
            f"    pg_restore -f salida.sql \"{ruta}\"\n"
            "y vuelve a pasarme salida.sql"
        )

    texto = ruta.read_text(encoding="utf-8", errors="replace")
    lineas = texto.splitlines()

    tablas: dict[str, int] = {}
    creadas: list[str] = []
    bases: list[str] = []

    indice = 0

    while indice < len(lineas):

        linea = lineas[indice]

        if linea.startswith("CREATE TABLE "):
            nombre = linea.split()[2].rstrip("(").strip()
            creadas.append(nombre)

        elif linea.startswith("CREATE DATABASE "):
            bases.append(linea.split()[2])

        elif linea.startswith("COPY "):

            nombre = linea.split()[1]
            filas = 0
            indice += 1

            # El bloque de datos termina con una línea que solo
            # contiene una barra invertida y un punto.
            while indice < len(lineas) and lineas[indice].strip() != "\\.":
                if lineas[indice].strip():
                    filas += 1
                indice += 1

            tablas[nombre] = tablas.get(nombre, 0) + filas

        elif linea.startswith("INSERT INTO "):
            coincidencia = re.match(r"INSERT INTO ([\w.\"]+)", linea)
            if coincidencia:
                nombre = coincidencia.group(1).replace('"', "")
                tablas[nombre] = tablas.get(nombre, 0) + 1

        indice += 1

    return {"tablas": tablas, "creadas": creadas, "bases": bases}


def informe(ruta: Path, filtro: str | None = None) -> None:

    datos = analizar(ruta)

    tamano = ruta.stat().st_size / 1024

    print(f"\n  Archivo: {ruta.name}  ({tamano:.0f} KB)")

    if datos["bases"]:
        print(f"  Bases de datos: {', '.join(datos['bases'])}")

    con_datos = {t: f for t, f in datos["tablas"].items() if f}

    propias = {
        t: f for t, f in con_datos.items()
        if esquema_de(t) not in ESQUEMAS_DE_SISTEMA
    }

    sistema = {
        t: f for t, f in con_datos.items()
        if esquema_de(t) in ESQUEMAS_DE_SISTEMA
    }

    if filtro:
        coincidencias = {
            t: f for t, f in datos["tablas"].items() if filtro.lower() in t.lower()
        }
        print(f"\n  Tablas que contienen «{filtro}»:")
        if coincidencias:
            for tabla, filas in sorted(coincidencias.items()):
                print(f"    {tabla}: {filas} filas")
        else:
            print("    ninguna")
        print()
        return

    print(f"  Tablas definidas: {len(datos['creadas'])}")

    print("\n  TUS DATOS")

    if propias:
        for tabla, filas in sorted(propias.items(), key=lambda x: -x[1]):
            print(f"    {tabla}: {filas} filas")
    else:
        print("    No hay ninguna tabla con datos fuera de los esquemas")
        print("    internos. Este backup no sirve para recuperar información.")

    if sistema:
        print("\n  Tablas internas del sistema (no interesan)")
        for tabla, filas in sorted(sistema.items(), key=lambda x: -x[1])[:6]:
            print(f"    {tabla}: {filas} filas")

    print()


def main() -> None:

    argumentos = [a for a in sys.argv[1:] if not a.startswith("--")]

    if not argumentos:
        sys.exit(__doc__)

    filtro = None

    if "--tabla" in sys.argv:
        posicion = sys.argv.index("--tabla")
        if posicion + 1 < len(sys.argv):
            filtro = sys.argv[posicion + 1]
            argumentos = [a for a in argumentos if a != filtro]

    ruta = Path(argumentos[0]).expanduser()

    if not ruta.exists():
        sys.exit(f"No se encuentra el archivo {ruta}.")

    informe(ruta, filtro)


if __name__ == "__main__":
    main()
