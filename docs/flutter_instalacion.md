# Instalación de Flutter en Windows

Guía para dejar el entorno listo antes de crear la app.
Verificada contra la documentación oficial de Flutter 3.44 (mayo de 2026).

---

## 1. Qué hace falta

- Windows 10 o superior, 64 bits
- Unos 25 GB libres (el SDK de Android ocupa bastante)
- Git para Windows
- PowerShell

---

## 2. Instalar el SDK de Flutter

La vía recomendada ahora es desde Visual Studio Code: la extensión
descarga y configura el SDK sola, sin tocar variables de entorno a mano.

1. Instalar [Visual Studio Code](https://code.visualstudio.com/).
2. Abrir la pestaña de extensiones y buscar **Flutter**. Instalar la
   oficial (de Dart Code).
3. Abrir la paleta de comandos con `Ctrl+Shift+P`.
4. Ejecutar **Flutter: New Project**.
5. VS Code detecta que no hay SDK y ofrece **Download SDK**. Aceptar y
   elegir una carpeta sin espacios ni acentos en la ruta, por ejemplo:

   ```
   C:\dev\flutter
   ```

   Evita `C:\Program Files` y el escritorio: los espacios en la ruta dan
   problemas con algunas herramientas de compilación.

La alternativa manual está en
<https://docs.flutter.dev/install/manual>, por si prefieres controlar
tú la descarga.

---

## 3. Instalar Android Studio

Aunque escribas el código en VS Code, hace falta Android Studio porque
trae el SDK de Android, las herramientas de línea de comandos y el
emulador.

1. Descargar de <https://developer.android.com/studio> e instalar con
   las opciones por defecto.
2. Abrirlo una vez y dejar que termine el asistente inicial.
3. En **Settings → Languages & Frameworks → Android SDK → SDK Tools**,
   marcar:
   - Android SDK Command-line Tools
   - Android SDK Platform-Tools
4. Aplicar y esperar la descarga.

Después, aceptar las licencias desde PowerShell:

```powershell
flutter doctor --android-licenses
```

Hay que responder `y` varias veces.

---

## 4. Comprobar que todo está bien

```powershell
flutter doctor
```

El objetivo es ver `[√]` en **Flutter** y en **Android toolchain**.

Es normal y no importa para este proyecto:

- `[X] Visual Studio` — solo hace falta para compilar apps de escritorio Windows
- `[X] Xcode` — solo para iOS, que requiere un Mac
- `[!] Chrome` — solo para la versión web

Si aparece `Unable to locate Android SDK`, indícale dónde está:

```powershell
flutter config --android-sdk "C:\Users\Usuario\AppData\Local\Android\Sdk"
```

---

## 5. Preparar un dispositivo

**Opción A: tu móvil Android** (más rápido y realista)

1. En el móvil: Ajustes → Información del teléfono → pulsar siete veces
   sobre *Número de compilación*.
2. Volver a Ajustes → Opciones de desarrollador → activar **Depuración
   por USB**.
3. Conectar por cable y aceptar el aviso de confianza.

**Opción B: emulador**

En Android Studio, **Device Manager → Create Virtual Device**. Elegir
un Pixel reciente y una imagen de sistema con Google Play.

Comprobar que se detecta:

```powershell
flutter devices
```

---

## 6. Crear el proyecto

Desde la raíz del repositorio:

```powershell
cd E:\Personal\Python\py_personal\finanzas_personales
flutter create --org com.jonathan --project-name finanzas_movil mobile_flutter
cd mobile_flutter
flutter run
```

Si aparece la aplicación de ejemplo con el contador, el entorno está
listo.

---

## 7. Detalle importante: cómo llega la app al backend

Dentro del emulador, `localhost` es el propio emulador, no tu PC. La
API no responderá si usas `http://localhost:8000`.

| Desde dónde | URL de la API |
|---|---|
| Emulador de Android | `http://10.0.2.2:8000` |
| Móvil físico por Wi-Fi | `http://<IP-de-tu-PC>:8000` |
| Navegador del PC | `http://localhost:8000` |

Para averiguar la IP de tu PC:

```powershell
ipconfig
```

Buscar *Dirección IPv4* en el adaptador de Wi-Fi, algo como
`192.168.1.40`.

Además, con un móvil físico hay dos cosas que suelen fallar:

1. **Uvicorn debe escuchar en toda la red.** Ya está configurado con
   `API_HOST=0.0.0.0`, así que basta con arrancarlo con `python run.py`.
2. **El firewall de Windows bloquea el puerto 8000** la primera vez.
   Cuando salga el aviso, permitir el acceso en redes privadas.

Para comprobar que el móvil llega, abre en su navegador:

```
http://<IP-de-tu-PC>:8000/health
```

Si devuelve el JSON de estado, la app también podrá conectarse.

---

## Fuentes

- [Install Flutter](https://docs.flutter.dev/install)
- [Install manually](https://docs.flutter.dev/install/manual)
- [Set up Android development](https://docs.flutter.dev/platform-integration/android/setup)
