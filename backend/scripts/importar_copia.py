"""
Carga en PostgreSQL una copia exportada desde el móvil.

Uso (desde la carpeta backend/, con el entorno virtual activo):

    python -m scripts.importar_copia <archivo.json> <email>
    python -m scripts.importar_copia <archivo.json> <email> --simular

Los movimientos se identifican por su uuid, así que importar dos
veces el mismo archivo no duplica nada: la segunda vez actualiza.

Las categorías, subcategorías y medios de pago se buscan por nombre
y se crean si no existen, porque los números internos del móvil no
tienen por qué coincidir con los de la base de datos.
"""

import json
import sys
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import select

from app.database.database import SessionLocal
from app.models.categoria import Categoria
from app.models.medio_pago import MedioPago
from app.models.movimiento import Movimiento
from app.models.subcategoria import Subcategoria
from app.models.tipo_movimiento import TipoMovimiento
from app.models.usuario import Usuario

TIPOS_VALIDOS = {"ingreso", "gasto"}


def _fecha(valor) -> date | None:
    """
    Convierte la fecha del archivo a un objeto date.

    Se hace explícitamente para que una fecha mal escrita se descarte
    aquí, con un aviso, en lugar de llegar a la base de datos.
    """

    if not valor:
        return None

    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError:
        return None


class Resumen:
    """Cuenta lo que ha ido pasando, para informar al final."""

    def __init__(self):
        self.creados = 0
        self.actualizados = 0
        self.omitidos = 0
        self.catalogos_creados = []

    def mostrar(self, simulado: bool) -> None:

        print()

        if self.catalogos_creados:
            print("  Elementos de catálogo creados:")
            for elemento in self.catalogos_creados:
                print(f"    · {elemento}")
            print()

        etiqueta = "se crearían" if simulado else "creados"
        etiqueta2 = "se actualizarían" if simulado else "actualizados"

        print(f"  Movimientos {etiqueta}: {self.creados}")
        print(f"  Movimientos {etiqueta2}: {self.actualizados}")

        if self.omitidos:
            print(f"  Omitidos por datos incorrectos: {self.omitidos}")

        print()


def _buscar_usuario(db, email: str) -> Usuario:

    usuario = db.execute(
        select(Usuario).where(Usuario.email == email)
    ).scalars().first()

    if usuario is None:
        sys.exit(
            f"No existe ningún usuario con el email {email}.\n"
            "Míralos con: python -m scripts.gestionar_usuario listar"
        )

    return usuario


def _tipo_movimiento(db, nombre: str, resumen: Resumen) -> TipoMovimiento:

    tipo = db.execute(
        select(TipoMovimiento).where(TipoMovimiento.nombre == nombre)
    ).scalars().first()

    if tipo is None:
        tipo = TipoMovimiento(nombre=nombre)
        db.add(tipo)
        db.flush()
        resumen.catalogos_creados.append(f"tipo «{nombre}»")

    return tipo


def _categoria(db, nombre: str, tipo_nombre: str, resumen: Resumen) -> Categoria:

    categoria = db.execute(
        select(Categoria).where(Categoria.nombre == nombre)
    ).scalars().first()

    if categoria is None:
        tipo = _tipo_movimiento(db, tipo_nombre, resumen)
        categoria = Categoria(nombre=nombre, tipo_id=tipo.id)
        db.add(categoria)
        db.flush()
        resumen.catalogos_creados.append(f"categoría «{nombre}»")

    return categoria


def _subcategoria(db, nombre: str, categoria: Categoria, resumen: Resumen) -> Subcategoria:

    subcategoria = db.execute(
        select(Subcategoria).where(
            Subcategoria.nombre == nombre,
            Subcategoria.categoria_id == categoria.id,
        )
    ).scalars().first()

    if subcategoria is None:
        subcategoria = Subcategoria(nombre=nombre, categoria_id=categoria.id)
        db.add(subcategoria)
        db.flush()
        resumen.catalogos_creados.append(
            f"subcategoría «{nombre}» en {categoria.nombre}"
        )

    return subcategoria


def _medio_pago(db, nombre: str, resumen: Resumen) -> MedioPago:

    medio = db.execute(
        select(MedioPago).where(MedioPago.nombre == nombre)
    ).scalars().first()

    if medio is None:
        medio = MedioPago(nombre=nombre)
        db.add(medio)
        db.flush()
        resumen.catalogos_creados.append(f"medio de pago «{nombre}»")

    return medio


def importar(ruta: Path, email: str, simular: bool = False) -> None:

    if not ruta.exists():
        sys.exit(f"No se encuentra el archivo {ruta}.")

    copia = json.loads(ruta.read_text(encoding="utf-8"))

    if copia.get("aplicacion") != "finanzas":
        sys.exit("Este archivo no es una copia de Finanzas.")

    movimientos = copia.get("movimientos", [])

    print(f"\n  Archivo: {ruta.name}")
    print(f"  Exportado: {copia.get('exportado_en', 'desconocido')}")
    print(f"  Movimientos en el archivo: {len(movimientos)}")

    if simular:
        print("\n  MODO SIMULACIÓN: no se escribe nada.")

    resumen = Resumen()

    with SessionLocal() as db:

        usuario = _buscar_usuario(db, email)

        for entrada in movimientos:

            uuid = entrada.get("uuid")
            tipo = entrada.get("tipo")

            if not uuid or tipo not in TIPOS_VALIDOS:
                resumen.omitidos += 1
                continue

            try:
                monto = Decimal(str(entrada.get("monto")))
            except (InvalidOperation, TypeError):
                resumen.omitidos += 1
                continue

            if monto <= 0:
                resumen.omitidos += 1
                continue

            fecha = _fecha(entrada.get("fecha"))

            if fecha is None:
                resumen.omitidos += 1
                continue

            nombre_categoria = entrada.get("categoria") or "Sin categoría"
            nombre_sub = entrada.get("subcategoria") or "Sin clasificar"

            categoria = _categoria(db, nombre_categoria, tipo, resumen)
            subcategoria = _subcategoria(db, nombre_sub, categoria, resumen)

            medio = None

            if entrada.get("medio_pago"):
                medio = _medio_pago(db, entrada["medio_pago"], resumen)

            existente = db.execute(
                select(Movimiento).where(Movimiento.uuid == uuid)
            ).scalars().first()

            valores = dict(
                fecha=fecha,
                monto=monto,
                tipo=tipo,
                subcategoria_id=subcategoria.id,
                medio_pago_id=medio.id if medio else None,
                descripcion=entrada.get("descripcion"),
                comentario=entrada.get("comentario"),
                usuario_id=usuario.id,
            )

            if existente is None:
                db.add(Movimiento(uuid=uuid, origen="movil", **valores))
                resumen.creados += 1
            else:
                for campo, valor in valores.items():
                    setattr(existente, campo, valor)
                resumen.actualizados += 1

        if simular:
            db.rollback()
        else:
            db.commit()

    resumen.mostrar(simular)


def main() -> None:

    argumentos = [a for a in sys.argv[1:] if a != "--simular"]
    simular = "--simular" in sys.argv

    if len(argumentos) != 2:
        sys.exit(__doc__)

    importar(Path(argumentos[0]), argumentos[1], simular)


if __name__ == "__main__":
    main()
