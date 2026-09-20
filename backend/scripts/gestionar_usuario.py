"""
Gestión de usuarios desde la línea de comandos.

Uso (desde la carpeta backend/, con el entorno virtual activo):

    python -m scripts.gestionar_usuario listar
    python -m scripts.gestionar_usuario crear <email> <nombre>
    python -m scripts.gestionar_usuario password <email>
    python -m scripts.gestionar_usuario email <id> <nuevo-email>
    python -m scripts.gestionar_usuario nombre <id> <nuevo-nombre>

El acceso a la aplicación es por correo, así que un usuario creado
antes de tener la columna de email necesita que se le asigne uno con
el último comando.

La contraseña se pide de forma interactiva: así no queda registrada
en el historial de la terminal.
"""

import getpass
import sys

from sqlalchemy import select

from app.auth.security import hashear_password
from app.database.database import SessionLocal
from app.models.usuario import Usuario

LONGITUD_MINIMA = 8


def _buscar(db, email: str) -> Usuario | None:

    return db.execute(
        select(Usuario).where(Usuario.email == email)
    ).scalars().first()


def _pedir_password() -> str:

    password = getpass.getpass("Contraseña: ")

    if len(password) < LONGITUD_MINIMA:
        sys.exit(
            f"La contraseña debe tener al menos {LONGITUD_MINIMA} caracteres."
        )

    if password != getpass.getpass("Repite la contraseña: "):
        sys.exit("Las contraseñas no coinciden.")

    return password


def listar() -> None:

    with SessionLocal() as db:

        usuarios = db.execute(select(Usuario)).scalars().all()

        if not usuarios:
            print("No hay usuarios.")
            return

        for usuario in usuarios:

            estado = "sin contraseña"

            if usuario.password_hash:
                estado = "con contraseña"

            if usuario.deleted_at is not None:
                estado += ", eliminado"

            print(f"  [{usuario.id}] {usuario.email or '(sin email)'} "
                  f"- {usuario.nombre} ({estado})")


def crear(email: str, nombre: str) -> None:

    with SessionLocal() as db:

        if _buscar(db, email) is not None:
            sys.exit(f"Ya existe un usuario con el email {email}.")

        usuario = Usuario(
            email=email,
            nombre=nombre,
            password_hash=hashear_password(_pedir_password()),
        )

        db.add(usuario)
        db.commit()
        db.refresh(usuario)

        print(f"Usuario creado con id {usuario.id}.")


def password(email: str) -> None:

    with SessionLocal() as db:

        usuario = _buscar(db, email)

        if usuario is None:
            sys.exit(f"No existe ningún usuario con el email {email}.")

        usuario.password_hash = hashear_password(_pedir_password())

        db.commit()

        print(f"Contraseña actualizada para {email}.")


def email(id_usuario: str, nuevo_email: str) -> None:
    """
    Asigna o cambia el correo de un usuario ya existente.
    """

    with SessionLocal() as db:

        usuario = db.get(Usuario, int(id_usuario))

        if usuario is None:
            sys.exit(f"No existe ningún usuario con id {id_usuario}.")

        ocupado = _buscar(db, nuevo_email)

        if ocupado is not None and ocupado.id != usuario.id:
            sys.exit(f"El email {nuevo_email} ya lo usa otro usuario.")

        usuario.email = nuevo_email

        db.commit()

        print(f"Usuario {usuario.id} ({usuario.nombre}) -> {nuevo_email}")

        if not usuario.password_hash:
            print(
                "Todavía no tiene contraseña. Asígnasela con:\n"
                f"  python -m scripts.gestionar_usuario password {nuevo_email}"
            )


def nombre(id_usuario: str, nuevo_nombre: str) -> None:
    """
    Cambia el nombre de un usuario (lo que se usa para iniciar sesión
    en el dashboard local).
    """

    nuevo_nombre = nuevo_nombre.strip()

    if not nuevo_nombre:
        sys.exit("El nombre no puede estar vacío.")

    with SessionLocal() as db:

        usuario = db.get(Usuario, int(id_usuario))

        if usuario is None:
            sys.exit(f"No existe ningún usuario con id {id_usuario}.")

        anterior = usuario.nombre
        usuario.nombre = nuevo_nombre

        db.commit()

        print(f"Usuario {usuario.id}: «{anterior}» -> «{nuevo_nombre}»")


def main() -> None:

    argumentos = sys.argv[1:]

    if not argumentos:
        sys.exit(__doc__)

    comando, *resto = argumentos

    if comando == "listar":
        listar()

    elif comando == "crear" and len(resto) == 2:
        crear(resto[0], resto[1])

    elif comando == "password" and len(resto) == 1:
        password(resto[0])

    elif comando == "email" and len(resto) == 2:
        email(resto[0], resto[1])

    elif comando == "nombre" and len(resto) == 2:
        nombre(resto[0], resto[1])

    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
