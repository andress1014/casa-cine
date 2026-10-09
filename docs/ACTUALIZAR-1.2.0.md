# Actualización personal 1.2.0

Paquete local `releases/Guarida-v1.2.0-Windows.zip` contiene backend, frontend compilado, fuente, motor PS1/SNES y configuración TMDb personal. No incluye videos, documentos, juegos, BIOS, claves HTTPS ni `.env` anterior. APK independiente: `releases/Palomita-TV-v1.2.0.apk`.

## Windows ya instalado

1. Detén tarea CasaCine desde Programador de tareas (si servidor se inició manualmente, cierra esa ventana). Mantén copia de seguridad de DATA_DIR y `.env`.
2. Extrae ZIP en carpeta temporal. Copia contenido de `Guarida-v1.2.0` encima de repo Windows, por ejemplo `C:\Users\andre\Desktop\casa-cine`. Conserva `data`, `.env` y configuración de tarea; paquete no reemplaza esos archivos.
3. Desde PowerShell en carpeta del repo:

```powershell
npm ci
npm run build
```

Motor incluido evita descarga de 290 MB. `personal-settings.json` activa TMDb sin pegar clave; variable TMDB_API_KEY/READ_ACCESS_TOKEN en `.env` tiene prioridad.

4. Inicia tarea CasaCine. Página sigue en `http://localhost:3210`; otros equipos usan IP local de Windows. Cine: `/cine`, Gaming: `/gaming`.
5. Para DualSense desde otro dispositivo configura HTTPS local según [guía Gaming](GAMING.md).
6. Copia APK 1.2.0 a USB e instálala encima de APK anterior desde gestor de archivos de TV. Misma firma y paquete, versionCode mayor; conserva IP, favoritos y posición. Fondo aparece después de 30 segundos en pausa. Credencial TMDb ya está integrada.

Paquete es personal y contiene clave de lectura solicitada. Archivos locales de configuración permanecen fuera de Git. APK y ZIP todavía no están publicados en GitHub.

## Compilaciones realizadas

- Web: TypeScript + Vite, versión 1.2.0.
- APK: assembleDebug, versión 1.2.0, versionCode 3.
- Motor: release oficial EmulatorJS 4.2.3, checksum validado, interfaz y cores PS1/SNES instalados.
- No se ejecutaron pruebas nuevas de juegos, DualSense, pausa física en TV ni HTTPS Windows en este cambio. Compilación no garantiza compatibilidad de todos los juegos/dispositivos.
