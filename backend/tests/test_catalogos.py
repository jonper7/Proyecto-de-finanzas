def test_crear_y_listar_categoria(client):

    tipo = client.post("/tipos-movimiento", json={"nombre": "ingreso"})
    assert tipo.status_code == 201

    respuesta = client.post(
        "/categorias",
        json={"nombre": "Salario", "tipo_id": tipo.json()["id"]},
    )
    assert respuesta.status_code == 201
    assert respuesta.json()["nombre"] == "Salario"

    listado = client.get("/categorias")
    assert listado.status_code == 200
    assert listado.json()["total"] == 1


def test_categoria_con_tipo_inexistente(client):

    respuesta = client.post(
        "/categorias",
        json={"nombre": "Fantasma", "tipo_id": 999},
    )

    assert respuesta.status_code == 422


def test_obtener_categoria_inexistente(client):

    assert client.get("/categorias/999").status_code == 404


def test_soft_delete_desactiva(client, datos_base):

    categoria_id = datos_base["categoria"]["id"]

    assert client.delete(f"/categorias/{categoria_id}").status_code == 204

    detalle = client.get(f"/categorias/{categoria_id}")

    assert detalle.status_code == 200
    assert detalle.json()["activo"] is False


def test_email_duplicado(client, datos_base):

    respuesta = client.post(
        "/usuarios",
        json={"nombre": "Otro", "email": datos_base["usuario"]["email"]},
    )

    assert respuesta.status_code == 409


def test_filtro_por_categoria(client, datos_base):

    categoria_id = datos_base["categoria"]["id"]

    con_filtro = client.get(f"/subcategorias?categoria_id={categoria_id}")
    sin_resultados = client.get("/subcategorias?categoria_id=999")

    assert con_filtro.json()["total"] == 1
    assert sin_resultados.json()["total"] == 0
