"""
Comprueba que un usuario no pueda tocar movimientos de otro.
"""

from datetime import date

import pytest

from app.auth.security import hashear_password
from app.models.usuario import Usuario


def test_el_propietario_sale_del_token(client, datos_base, usuario):

    creado = client.post(
        "/movimientos",
        json={
            "fecha": "2026-07-01",
            "monto": "10.00",
            "tipo": "gasto",
            "subcategoria_id": datos_base["subcategoria"]["id"],
            "usuario_id": 9999,  # se ignora deliberadamente
        },
    )

    assert creado.status_code == 201
    assert creado.json()["usuario_id"] == usuario.id


def test_no_se_ven_movimientos_ajenos(
    client, client_otro, datos_base, db_session, usuario
):

    # Movimiento creado por el usuario principal, insertado a mano
    # para no depender del cliente autenticado.
    from app.models.movimiento import Movimiento

    movimiento = Movimiento(
        fecha=date(2026, 7, 1),
        monto=10,
        tipo="gasto",
        subcategoria_id=datos_base["subcategoria"]["id"],
        usuario_id=usuario.id,
    )

    db_session.add(movimiento)
    db_session.commit()
    db_session.refresh(movimiento)

    # El segundo usuario no lo ve en el listado...
    assert client_otro.get("/movimientos").json()["total"] == 0

    # ...ni accediendo por identificador.
    assert client_otro.get(
        f"/movimientos/{movimiento.id}"
    ).status_code == 404

    # ...ni puede modificarlo o borrarlo.
    assert client_otro.put(
        f"/movimientos/{movimiento.id}", json={"monto": "1.00"}
    ).status_code == 404

    assert client_otro.delete(
        f"/movimientos/{movimiento.id}"
    ).status_code == 404
