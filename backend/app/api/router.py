"""
Router agregador de la API.
"""

from fastapi import APIRouter

from app.api import (
    categorias,
    medios_pago,
    movimientos,
    pagos_recurrentes,
    presupuestos,
    subcategorias,
    sync,
    tipos_movimiento,
    usuarios,
)

api_router = APIRouter()

api_router.include_router(movimientos.router)
api_router.include_router(categorias.router)
api_router.include_router(subcategorias.router)
api_router.include_router(tipos_movimiento.router)
api_router.include_router(medios_pago.router)
api_router.include_router(usuarios.router)
api_router.include_router(presupuestos.router)
api_router.include_router(pagos_recurrentes.router)
api_router.include_router(sync.router)
