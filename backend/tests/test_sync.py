"""
Pruebas de la sincronización con el dispositivo móvil.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


def _ahora():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _movimiento_sync(datos_base, **extra):

    payload = {
        "uuid": str(uuid4()),
        "device_updated_at": _ahora().isoformat(),
        "fecha": "2026-07-05",
        "descripcion": "Compra en el mercado",
        "monto": "32.10",
        "tipo": "gasto",
        "subcategoria_id": datos_base["subcategoria"]["id"],
        "origen": "movil",
    }

    payload.update(extra)

    return payload


# ----------------------------------------------------------------------
# Descarga
# ----------------------------------------------------------------------


def test_pull_inicial_trae_catalogos(client, datos_base):

    respuesta = client.get("/sync/pull")

    assert respuesta.status_code == 200

    cuerpo = respuesta.json()

    assert cuerpo["server_time"]
    assert len(cuerpo["catalogos"]["categorias"]) == 1
    assert len(cuerpo["catalogos"]["subcategorias"]) == 1
    assert len(cuerpo["catalogos"]["medios_pago"]) == 1
    assert cuerpo["movimientos"] == []


def test_pull_incremental(client, datos_base):
    """
    La descarga con cursor solo trae lo modificado después.

    Nota: el servidor resta un margen de seguridad al cursor, así que
    puede reenviar algo ya conocido. Lo que nunca debe ocurrir es que
    se pierda un cambio.
    """

    cursor = client.get("/sync/pull").json()["server_time"]

    # Sin movimientos nuevos, no baja ninguno.
    vacio = client.get(f"/sync/pull?desde={cursor}").json()

    assert vacio["movimientos"] == []

    client.post(
        "/movimientos",
        json={
            "fecha": "2026-07-10",
            "monto": "12.00",
            "tipo": "gasto",
            "subcategoria_id": datos_base["subcategoria"]["id"],
        },
    )

    con_cambios = client.get(f"/sync/pull?desde={cursor}").json()

    assert len(con_cambios["movimientos"]) == 1


def test_pull_incluye_borrados(client, datos_base):

    creado = client.post(
        "/movimientos",
        json={
            "fecha": "2026-07-10",
            "monto": "12.00",
            "tipo": "gasto",
            "subcategoria_id": datos_base["subcategoria"]["id"],
        },
    ).json()

    cursor = client.get("/sync/pull").json()["server_time"]

    client.delete(f"/movimientos/{creado['id']}")

    cambios = client.get(f"/sync/pull?desde={cursor}").json()

    assert len(cambios["movimientos"]) == 1
    assert cambios["movimientos"][0]["deleted_at"] is not None


# ----------------------------------------------------------------------
# Subida
# ----------------------------------------------------------------------


def test_push_crea_movimiento(client, datos_base, usuario):

    registro = _movimiento_sync(datos_base)

    respuesta = client.post(
        "/sync/push", json={"movimientos": [registro]}
    )

    assert respuesta.status_code == 200

    resultado = respuesta.json()["movimientos"][0]

    assert resultado["estado"] == "creado", resultado
    assert resultado["id"]

    # El movimiento queda a nombre del usuario del token.
    detalle = client.get(f"/movimientos/{resultado['id']}").json()

    assert detalle["usuario_id"] == usuario.id
    assert detalle["origen"] == "movil"


def test_push_es_idempotente(client, datos_base):
    """
    Reenviar el mismo lote no debe duplicar registros.
    """

    registro = _movimiento_sync(datos_base)

    primero = client.post(
        "/sync/push", json={"movimientos": [registro]}
    ).json()["movimientos"][0]

    segundo = client.post(
        "/sync/push", json={"movimientos": [registro]}
    ).json()["movimientos"][0]

    assert primero["estado"] == "creado"
    assert segundo["estado"] in ("actualizado", "ignorado_por_antiguedad")
    assert primero["id"] == segundo["id"]

    assert client.get("/movimientos").json()["total"] == 1


def test_push_gana_la_modificacion_mas_reciente(client, datos_base):

    registro = _movimiento_sync(datos_base, monto="10.00")

    client.post("/sync/push", json={"movimientos": [registro]})

    # El dispositivo envía una edición posterior.
    reciente = dict(
        registro,
        monto="99.00",
        device_updated_at=(_ahora() + timedelta(minutes=5)).isoformat(),
    )

    resultado = client.post(
        "/sync/push", json={"movimientos": [reciente]}
    ).json()["movimientos"][0]

    assert resultado["estado"] == "actualizado"

    detalle = client.get(f"/movimientos/{resultado['id']}").json()

    assert float(detalle["monto"]) == 99.0


def test_push_descarta_la_version_antigua(client, datos_base):

    registro = _movimiento_sync(datos_base, monto="10.00")

    client.post("/sync/push", json={"movimientos": [registro]})

    # Edición hecha sin cobertura hace una hora: el servidor ya tiene
    # una versión más nueva.
    antigua = dict(
        registro,
        monto="1.00",
        device_updated_at=(_ahora() - timedelta(hours=1)).isoformat(),
    )

    resultado = client.post(
        "/sync/push", json={"movimientos": [antigua]}
    ).json()["movimientos"][0]

    assert resultado["estado"] == "ignorado_por_antiguedad"

    detalle = client.get(f"/movimientos/{resultado['id']}").json()

    assert float(detalle["monto"]) == 10.0


def test_push_propaga_el_borrado(client, datos_base):

    registro = _movimiento_sync(datos_base)

    creado = client.post(
        "/sync/push", json={"movimientos": [registro]}
    ).json()["movimientos"][0]

    borrado = dict(
        registro,
        eliminado=True,
        device_updated_at=(_ahora() + timedelta(minutes=1)).isoformat(),
    )

    resultado = client.post(
        "/sync/push", json={"movimientos": [borrado]}
    ).json()["movimientos"][0]

    assert resultado["estado"] == "eliminado"
    assert client.get(f"/movimientos/{creado['id']}").status_code == 404


def test_push_con_referencia_invalida_no_rompe_el_lote(client, datos_base):
    """
    Un registro erróneo no debe impedir que se guarden los demás.
    """

    bueno = _movimiento_sync(datos_base)
    malo = _movimiento_sync(datos_base, subcategoria_id=99999)

    resultados = client.post(
        "/sync/push", json={"movimientos": [bueno, malo]}
    ).json()["movimientos"]

    estados = {r["uuid"]: r["estado"] for r in resultados}

    assert estados[bueno["uuid"]] == "creado"
    assert estados[malo["uuid"]] == "error"


def test_push_no_toca_movimientos_de_otro_usuario(
    client, client_otro, datos_base
):

    registro = _movimiento_sync(datos_base)

    client.post("/sync/push", json={"movimientos": [registro]})

    intruso = dict(
        registro,
        monto="500.00",
        device_updated_at=(_ahora() + timedelta(minutes=10)).isoformat(),
    )

    resultado = client_otro.post(
        "/sync/push", json={"movimientos": [intruso]}
    ).json()["movimientos"][0]

    assert resultado["estado"] == "error"
    assert "otro usuario" in resultado["mensaje"]


# ----------------------------------------------------------------------
# Ciclo completo
# ----------------------------------------------------------------------


def test_ciclo_push_y_pull(client, datos_base):
    """
    Lo que sube el dispositivo vuelve a bajar en la siguiente descarga.
    """

    registro = _movimiento_sync(datos_base, descripcion="Gasolina")

    client.post("/sync/push", json={"movimientos": [registro]})

    cambios = client.get("/sync/pull").json()

    descargado = cambios["movimientos"][0]

    assert descargado["uuid"] == registro["uuid"]
    assert descargado["descripcion"] == "Gasolina"

    # Con el cursor nuevo no aparece nada más: como mucho vuelve el
    # mismo registro por el margen de seguridad, nunca uno distinto.
    siguiente = client.get(
        f"/sync/pull?desde={cambios['server_time']}"
    ).json()

    uuids = {m["uuid"] for m in siguiente["movimientos"]}

    assert uuids <= {registro["uuid"]}


def test_el_margen_del_cursor_no_pierde_cambios(client, datos_base):
    """
    Un registro modificado justo en el instante del cursor debe
    seguir bajando en la siguiente descarga.
    """

    creado = client.post(
        "/movimientos",
        json={
            "fecha": "2026-07-10",
            "monto": "12.00",
            "tipo": "gasto",
            "subcategoria_id": datos_base["subcategoria"]["id"],
        },
    ).json()

    # Se pide el cursor inmediatamente después de escribir.
    cursor = client.get("/sync/pull").json()["server_time"]

    descargados = client.get(f"/sync/pull?desde={cursor}").json()

    assert creado["id"] in [m["id"] for m in descargados["movimientos"]]
