def _movimiento(datos_base, **extra):

    payload = {
        "fecha": "2026-07-01",
        "descripcion": "Recibo de la luz",
        "monto": "45.50",
        "tipo": "gasto",
        "subcategoria_id": datos_base["subcategoria"]["id"],
        "medio_pago_id": datos_base["medio_pago"]["id"],
    }

    payload.update(extra)

    return payload


def test_crud_completo(client, datos_base):

    creado = client.post("/movimientos", json=_movimiento(datos_base))
    assert creado.status_code == 201

    movimiento_id = creado.json()["id"]
    assert creado.json()["sync_status"] == "pending"

    detalle = client.get(f"/movimientos/{movimiento_id}")
    assert detalle.status_code == 200

    actualizado = client.put(
        f"/movimientos/{movimiento_id}",
        json={"monto": "60.00"},
    )
    assert actualizado.status_code == 200
    assert float(actualizado.json()["monto"]) == 60.0

    assert client.delete(f"/movimientos/{movimiento_id}").status_code == 204
    assert client.get(f"/movimientos/{movimiento_id}").status_code == 404
    assert client.get("/movimientos").json()["total"] == 0


def test_subcategoria_inexistente(client, datos_base):

    respuesta = client.post(
        "/movimientos",
        json=_movimiento(datos_base, subcategoria_id=999),
    )

    assert respuesta.status_code == 422


def test_tipo_invalido(client, datos_base):

    respuesta = client.post(
        "/movimientos",
        json=_movimiento(datos_base, tipo="Gasto"),
    )

    assert respuesta.status_code == 422


def test_monto_negativo(client, datos_base):

    respuesta = client.post(
        "/movimientos",
        json=_movimiento(datos_base, monto="-10.00"),
    )

    assert respuesta.status_code == 422


def test_filtros_y_paginacion(client, datos_base):

    for dia in range(1, 6):
        client.post(
            "/movimientos",
            json=_movimiento(datos_base, fecha=f"2026-07-0{dia}"),
        )

    client.post(
        "/movimientos",
        json=_movimiento(
            datos_base,
            fecha="2026-06-15",
            tipo="ingreso",
            monto="1000.00",
            descripcion="Nomina",
        ),
    )

    todos = client.get("/movimientos")
    assert todos.json()["total"] == 6

    julio = client.get(
        "/movimientos?fecha_desde=2026-07-01&fecha_hasta=2026-07-31"
    )
    assert julio.json()["total"] == 5

    ingresos = client.get("/movimientos?tipo=ingreso")
    assert ingresos.json()["total"] == 1

    por_categoria = client.get(
        f"/movimientos?categoria_id={datos_base['categoria']['id']}"
    )
    assert por_categoria.json()["total"] == 6

    texto = client.get("/movimientos?texto=nomina")
    assert texto.json()["total"] == 1

    pagina = client.get("/movimientos?limit=2&skip=0")
    assert pagina.json()["total"] == 6
    assert len(pagina.json()["items"]) == 2


def test_resumen(client, datos_base):

    client.post(
        "/movimientos",
        json=_movimiento(datos_base, monto="100.00", tipo="gasto"),
    )

    client.post(
        "/movimientos",
        json=_movimiento(datos_base, monto="250.00", tipo="ingreso"),
    )

    resumen = client.get("/movimientos/resumen").json()

    assert float(resumen["ingresos"]) == 250.0
    assert float(resumen["gastos"]) == 100.0
    assert float(resumen["balance"]) == 150.0
