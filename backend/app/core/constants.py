"""
Constantes globales de la aplicación.
"""

# ==========================
# Aplicación
# ==========================

APP_NAME = "Finanzas Personales"
APP_VERSION = "0.2.0"

# ==========================
# Tipos de movimiento
# ==========================

# En minuscula: la tabla movimientos tiene un CHECK que solo admite
# 'ingreso' y 'gasto'.
TIPO_INGRESO = "ingreso"
TIPO_GASTO = "gasto"

# ==========================
# Estados de sincronización
# ==========================

SYNC_PENDING = "pending"
SYNC_SYNCED = "synced"
SYNC_DELETED = "deleted"