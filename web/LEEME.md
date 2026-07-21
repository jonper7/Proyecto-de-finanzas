# Finanzas — aplicación web

Aplicación de gastos personales que funciona entera en el móvil, sin
servidor y sin conexión. Los datos se guardan en el propio navegador.

---

## Publicarla en GitHub Pages

Solo hay que hacerlo una vez.

### 1. Subir el proyecto a GitHub

Ahora mismo el repositorio de git está dentro de `backend/`. Conviene
tener uno solo para todo el proyecto:

```powershell
cd E:\Personal\Python\py_personal\finanzas_personales
git init
git add .
git commit -m "Proyecto de finanzas personales"
```

Después, crea un repositorio vacío en <https://github.com/new> (puede
ser privado: Pages funciona igual) y enlázalo:

```powershell
git remote add origin https://github.com/TU-USUARIO/finanzas.git
git branch -M main
git push -u origin main
```

### 2. Activar Pages

En el repositorio de GitHub: **Settings → Pages → Build and deployment
→ Source → GitHub Actions**.

Con eso, el archivo `.github/workflows/pages.yml` publica la carpeta
`web/` en cada cambio. La primera publicación tarda un par de minutos.

La dirección será:

```
https://TU-USUARIO.github.io/finanzas/
```

### 3. Instalarla en el móvil

Abre esa dirección en Chrome y usa **menú ⋮ → Añadir a pantalla de
inicio**.

Como GitHub Pages sirve por HTTPS, el navegador guarda la aplicación
en el teléfono: a partir de ahí abre sin conexión y sin depender de
nada encendido.

---

## Copia de seguridad

Los datos viven **solo en tu móvil**. Si lo pierdes o borras los datos
del navegador, se pierden.

En **Ajustes → Descargar copia** se genera un archivo
`finanzas-AAAA-MM-DD.json` con todo. Guárdalo donde sueles guardar
las cosas importantes: correo, Drive, un pendrive.

Para recuperarlo, o para pasar los datos a otro móvil: **Ajustes →
Restaurar desde un archivo**.

Restaurar dos veces el mismo archivo no duplica nada, porque cada
movimiento lleva un identificador propio.

---

## Llevar los datos a PostgreSQL

Si quieres analizarlos desde el ordenador, el backend incluye un
importador:

```powershell
cd backend
python -m scripts.importar_copia C:\ruta\finanzas-2026-07-20.json tu@email.com
```

Con `--simular` al final te dice lo que haría sin escribir nada.

Las categorías se buscan por nombre y se crean si faltan, así que no
importa que los números internos del móvil no coincidan con los de la
base de datos.

---

## Estructura

```
web/
├── index.html          pantallas de movimientos y ajustes
├── manifest.json       datos de instalación
├── sw.js               service worker (permite abrir sin conexión)
├── css/estilos.css
├── js/
│   ├── datos.js        almacén local (IndexedDB) y catálogo inicial
│   ├── copia.js        exportar e importar JSON
│   └── app.js          interfaz
└── iconos/
```

No hay compilación ni dependencias: se editan los archivos y se
recarga la página.

---

## Probarla en local

Un doble clic en `index.html` no vale: el service worker necesita
`http://` o `https://`. Con Python basta:

```powershell
cd web
python -m http.server 8080
```

Y abrir <http://localhost:8080>.
